import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizedOwner, extractTestMessages, prepareTest, sendTestReply } from '../app/api/instagram/audio-test/service.js';

const NOW = Date.now();
const KEYWORD = 'GUIAUDIO0123456789';
const ID = '11111111-1111-4111-8111-111111111111';
const event = { accountId: '17841401155694295', senderId: '200000001', messageId: 'incoming-1', keyword: KEYWORD, timestamp: NOW };

function mockEnv(t, key, value) {
  const previous = process.env[key];
  process.env[key] = value;
  t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
}

function payload(overrides = {}, entryId = event.accountId) {
  return { object: 'instagram', entry: [{ id: entryId, messaging: [{
    sender: { id: event.senderId }, recipient: { id: entryId }, timestamp: NOW,
    message: { text: KEYWORD, mid: event.messageId }, ...overrides,
  }] }] };
}

function fakeDb(overrides = {}) {
  const row = {
    id: ID, user_id: 'owner', status: 'ready', keyword: KEYWORD, ig_account_id: event.accountId,
    prepared_at: new Date(NOW - 1000).toISOString(), expires_at: new Date(NOW + 3600000).toISOString(),
    audio_path: `owner/${ID}.mp3`, ...overrides,
  };
  const db = {
    row, uploads: [],
    auth: { getUser: async (token) => token === 'valid-session' ? { data: { user: { id: 'owner' } } } : { error: new Error('invalid') } },
    storage: {
      getBucket: async () => ({ data: { public: false } }),
      createBucket: async () => { throw new Error('Should reuse the private bucket'); },
      from: () => ({
        createSignedUrl: async () => ({ data: { signedUrl: 'https://storage.example/test.mp3?token=short-lived' } }),
        upload: async (path, bytes, options) => { db.uploads.push({ path, bytes, options }); return {}; },
      }),
    },
    from(table) {
      const filters = [];
      let patch;
      const query = {
        select() { return query; }, update(value) { patch = value; return query; },
        eq(key, value) { filters.push((row) => row[key] === value); return query; },
        in(key, values) { filters.push((row) => values.includes(row[key])); return query; },
        gt(key, value) { filters.push((row) => row[key] > value); return query; },
        lte(key, value) { filters.push((row) => row[key] <= value); return query; },
        async maybeSingle() {
          const target = table === 'content_items' ? { id: 'state', title: '__SOCIAL_HUB_STATE__', user_id: 'owner' } : row;
          if (!filters.every((filter) => filter(target))) return { data: null };
          if (patch) Object.assign(target, patch);
          return { data: { ...target } };
        },
        then(resolve, reject) { return query.maybeSingle().then(resolve, reject); },
      };
      return query;
    },
  };
  return db;
}

test('only an exact code in a recent incoming Direct message is eligible', () => {
  assert.equal(extractTestMessages(payload(), NOW).length, 1);
  for (const message of [
    { text: `please ${KEYWORD}`, mid: 'm' }, { text: 'IMERSÃO', mid: 'm' },
    { text: KEYWORD, mid: 'm', is_echo: true }, { text: KEYWORD, mid: 'm', is_deleted: true },
    { text: KEYWORD },
  ]) assert.equal(extractTestMessages(payload({ message }), NOW).length, 0);
  for (const override of [
    { sender: { id: event.accountId } }, { sender: { id: 'not-an-id' } },
    { recipient: { id: 'other-account' } }, { timestamp: NOW - 24 * 3600000 },
    { timestamp: NOW + 600000 }, { timestamp: null },
  ]) assert.equal(extractTestMessages(payload(override), NOW).length, 0);
  assert.deepEqual(extractTestMessages({ object: 'instagram', entry: [{ id: event.accountId, changes: [{ field: 'comments', value: { text: KEYWORD } }] }] }, NOW), []);
  assert.deepEqual(extractTestMessages({ ...payload(), object: 'page' }, NOW), []);
});

test('a verified Hub owner is required', async () => {
  const db = fakeDb();
  await assert.rejects(authorizedOwner(new Request('https://hub.example'), db), { status: 401 });
  await assert.rejects(authorizedOwner(new Request('https://hub.example', { headers: { Authorization: 'Bearer invalid' } }), db), { status: 401 });
  assert.equal(await authorizedOwner(new Request('https://hub.example', { headers: { Authorization: 'Bearer valid-session' } }), db), 'owner');
  db.auth.getUser = async () => ({ data: { user: { id: 'another-user' } } });
  await assert.rejects(authorizedOwner(new Request('https://hub.example', { headers: { Authorization: 'Bearer valid-session' } }), db), { status: 403 });
});

test('concurrent and repeated webhooks send one audio attachment to the initiating user', async (t) => {
  mockEnv(t, 'META_INSTAGRAM_ACCESS_TOKEN', 'test-token');
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return Response.json({ message_id: 'sent-1' });
  });
  const db = fakeDb();
  assert.deepEqual(await Promise.all([sendTestReply(db, event), sendTestReply(db, event)]), [true, false]);
  assert.equal(await sendTestReply(db, event), false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `https://graph.instagram.com/v26.0/${event.accountId}/messages`);
  assert.deepEqual(requests[0].body, {
    recipient: { id: event.senderId },
    message: { attachment: { type: 'audio', payload: { url: 'https://storage.example/test.mp3?token=short-lived' } } },
  });
  assert.equal(db.row.status, 'sent');
  assert.equal(db.row.sent_message_id, 'sent-1');
});

test('expired, cancelled, wrong-account and older messages cannot claim a test', async (t) => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Must not send'); });
  for (const patch of [
    { expires_at: new Date(NOW - 1000).toISOString() }, { status: 'cancelled' },
    { ig_account_id: 'different' }, { keyword: 'different' },
    { prepared_at: new Date(NOW + 60000).toISOString() },
  ]) assert.equal(await sendTestReply(fakeDb(patch), event), false);
});

test('ambiguous network failure never causes an automatic resend', async (t) => {
  mockEnv(t, 'META_INSTAGRAM_ACCESS_TOKEN', 'test-token');
  let sends = 0;
  t.mock.method(globalThis, 'fetch', async () => { sends++; throw new Error('timeout'); });
  t.mock.method(console, 'error', () => {});
  const db = fakeDb();
  await sendTestReply(db, event);
  assert.equal(db.row.status, 'send_failed');
  assert.match(db.row.error_message, /Confira o Direct/);
  await sendTestReply(db, event);
  assert.equal(sends, 1);
});

test('preparation keeps subscriptions and stores audio privately, without sending a message', async (t) => {
  mockEnv(t, 'META_INSTAGRAM_ACCESS_TOKEN', 'test-token');
  mockEnv(t, 'META_APP_SECRET', 'test-secret');
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('me?fields=user_id,username')) return Response.json({ user_id: event.accountId, username: 'gui_nonato' });
    if (url.endsWith('/subscribed_apps') && options.method === 'GET') return Response.json({ data: [{ subscribed_fields: ['comments', 'messaging_seen'] }] });
    if (url.endsWith('/subscribed_apps') && options.method === 'POST') return Response.json({ success: true });
    throw new Error('Unexpected request');
  });
  const db = fakeDb({ status: 'draft', audio_path: null, audio_base64: Buffer.from('ID3-audio-fixture').toString('base64') });
  await prepareTest(db, 'owner', ID);
  const subscribed = JSON.parse(requests.find((r) => r.options.method === 'POST').options.body).subscribed_fields;
  assert.deepEqual(new Set(subscribed.split(',')), new Set(['comments', 'messages', 'messaging_seen']));
  assert.equal(db.uploads.length, 1);
  assert.equal(db.uploads[0].options.contentType, 'audio/mpeg');
  assert.equal(db.row.audio_base64, null);
  assert.equal(db.row.status, 'ready');
  assert.match(db.row.keyword, /^GUIAUDIO[A-F0-9]{10}$/);
  assert.equal(requests.some((r) => r.url.endsWith('/messages')), false);
  await assert.rejects(prepareTest(db, 'owner', ID), { status: 409 });
});

test('a token connected to another Instagram cannot activate the test', async (t) => {
  mockEnv(t, 'META_INSTAGRAM_ACCESS_TOKEN', 'test-token');
  mockEnv(t, 'META_APP_SECRET', 'test-secret');
  t.mock.method(globalThis, 'fetch', async () => Response.json({ user_id: '1000', username: 'another_account' }));
  const db = fakeDb({ status: 'draft' });
  await assert.rejects(prepareTest(db, 'owner', ID), { status: 403 });
  assert.equal(db.row.status, 'prepare_failed');
  assert.equal(db.uploads.length, 0);
});
