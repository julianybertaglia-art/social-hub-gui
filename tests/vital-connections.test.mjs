import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { WORKSPACE, GUI_INSTAGRAM_ID, publicCandidate, publicConnection, selectCandidate,
  validAppToken, safePhoneId, validWebhookSignature, webhookDestination } from '../app/api/vital-connections/helpers.mjs';
import { saveWorkspaceMessages, dispatchWorkspaceWebhook } from '../app/api/vital-connections/webhook.mjs';

const now = 1791467000000;
const candidate = { id: '123456789', name: 'Vital Decor', accessToken: 'private-token', pageId: '12345' };
const session = { owner_user_id: 'owner', workspace_id: WORKSPACE, platform: 'instagram',
  status: 'prepared', expires_at: new Date(now + 60000).toISOString(), candidates: [candidate] };
const connection = { id: 'vital-connection', owner_user_id: 'owner', workspace_id: WORKSPACE,
  platform: 'whatsapp', state: 'connected', external_account_id: '222222', waba_id: '999999' };
const primary = { phoneNumberId: '111111', wabaId: '999999' };
const event = (phone, waba = '999999') => ({ wabaId: waba, field: 'messages',
  value: { metadata: { phone_number_id: phone }, messages: [] } });

test('pending authorization is bound to owner, workspace, platform, expiry and state', () => {
  assert.equal(selectCandidate(session, 'owner', 'instagram', candidate.id, now), candidate);
  for (const override of [
    { owner_user_id: 'someone-else' }, { workspace_id: 'gui-nonato' }, { platform: 'whatsapp' },
    { status: 'consuming' }, { status: 'consumed' }, { expires_at: new Date(now).toISOString() },
    { expires_at: 'invalid' },
  ]) assert.throws(() => selectCandidate({ ...session, ...override }, 'owner', 'instagram', candidate.id, now));
  assert.throws(() => selectCandidate(session, 'owner', 'instagram', 'not-authorized', now));
  assert.throws(() => selectCandidate({ ...session, candidates: [{ id: GUI_INSTAGRAM_ID }] },
    'owner', 'instagram', GUI_INSTAGRAM_ID, now));
});

test('public metadata never returns Meta credentials or pending authorization payload', () => {
  const item = publicCandidate({ ...candidate, code: 'secret-code', wabaId: 'internal-waba' });
  const row = publicConnection({ ...candidate, access_token: 'private-token', platform: 'instagram',
    state: 'connected', automatic_replies_enabled: true });
  for (const data of [item, row]) {
    assert.doesNotMatch(JSON.stringify(data), /private-token|secret-code|access_token|accessToken|internal-waba/);
  }
  assert.equal(row.automaticReplies, false);
});

test('Meta token must belong to this app and remain valid', () => {
  const valid = { is_valid: true, app_id: 'app', expires_at: now / 1000 + 1,
    data_access_expires_at: now / 1000 + 2 };
  assert.equal(validAppToken(valid, 'app', now), true);
  for (const data of [{ ...valid, is_valid: false }, { ...valid, app_id: 'other' },
    { ...valid, expires_at: now / 1000 }, { ...valid, data_access_expires_at: now / 1000 },
    { ...valid, expires_at: 'invalid' }]) assert.equal(validAppToken(data, 'app', now), false);
  assert.throws(() => safePhoneId('123456/other'));
  assert.throws(() => safePhoneId('../me'));
});

test('webhook signature validates configured apps and refuses changed or malformed payloads', () => {
  const payload = '{"entry":[]}';
  const signature = 'sha256=' + crypto.createHmac('sha256', 'second-app').update(payload).digest('hex');
  assert.equal(validWebhookSignature(payload, signature, ['first-app', 'second-app']), true);
  assert.equal(validWebhookSignature(payload + ' ', signature, ['second-app']), false);
  assert.equal(validWebhookSignature(payload, signature + 'zz', ['second-app']), false);
  assert.equal(validWebhookSignature(payload, signature, []), false);
});

test('same WABA can contain both brands without sharing messages or automations', () => {
  assert.equal(webhookDestination(event('222222'), [connection], primary).target, WORKSPACE);
  assert.equal(webhookDestination(event('111111'), [connection], primary).target, 'primary');
  assert.equal(webhookDestination(event('333333'), [connection], primary).target, 'ignore');
  assert.equal(webhookDestination(event('222222', 'other-waba'), [connection], primary).target, 'ignore');
  assert.equal(webhookDestination(event(''), [connection], primary).target, 'ignore');
  assert.equal(webhookDestination(event(''), [], primary).target, 'primary');
  assert.equal(webhookDestination(event('222222'), [{ ...connection, state: 'revoked' }], primary).target, 'ignore');
});

function fakeDb(rows = []) {
  const calls = [];
  const db = { from(table) {
    const call = { table, filters: [] };
    calls.push(call);
    const chain = {
      select() { return chain; },
      eq(key, value) { call.filters.push([key, value]); return chain; },
      upsert(row, options) { call.row = row; call.options = options; return chain; },
      update(row) { call.row = row; return chain; },
      then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); },
    };
    return chain;
  } };
  return { db, calls };
}

test('Vital Decor incoming messages only write to the private workspace table', async () => {
  const { db, calls } = fakeDb([connection]);
  const change = event('222222');
  change.value.messages = [{ id: 'wamid.test', from: '5511971611999',
    timestamp: '1791467000', type: 'text', text: { body: 'Teste' } }];
  change.value.contacts = [{ wa_id: '5511971611999', profile: { name: 'Contato' } }];
  assert.equal(await dispatchWorkspaceWebhook(db, change, primary), WORKSPACE);
  const writes = calls.filter((call) => call.row);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].table, 'workspace_meta_messages');
  assert.equal(writes[0].row.connection_id, connection.id);
  assert.equal(writes[0].row.owner_user_id, connection.owner_user_id);
  assert.equal(writes[0].row.direction, 'inbound');
  assert.equal(writes[0].row.body, 'Teste');
  assert.equal(writes[0].options.onConflict, 'connection_id,meta_message_id');
  const unknown = fakeDb([connection]);
  assert.equal(await dispatchWorkspaceWebhook(unknown.db, event('333333'), primary), 'ignore');
  assert.equal(unknown.calls.filter((call) => call.row).length, 0);
});

test('edits, revocations and delivery receipts cannot update another account', async () => {
  const { db, calls } = fakeDb();
  await saveWorkspaceMessages(db, { field: 'smb_message_echoes', value: { message_echoes: [
    { type: 'edit', edit: { original_message_id: 'same-id', message: { text: { body: 'Editado' } } } },
    { type: 'revoke', revoke: { original_message_id: 'same-id' } },
  ] } }, connection);
  await saveWorkspaceMessages(db, { field: 'messages',
    value: { statuses: [{ id: 'same-id', status: 'read' }] } }, connection);
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.table, 'workspace_meta_messages');
    assert.deepEqual(call.filters, [['connection_id', connection.id], ['meta_message_id', 'same-id']]);
  }
});
