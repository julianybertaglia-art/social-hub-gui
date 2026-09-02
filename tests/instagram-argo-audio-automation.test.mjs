import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTOMATION_TABLE, DELIVERY_TABLE, buildAudioMenu, extractAudioSelectionEvents,
  matchesAudioTrigger, processAudioSelections, sendAudioDelivery,
} from '../app/api/instagram/audio-automation/service.js';
import { ARGO_MENU_BUTTONS, ARGO_MENU_MESSAGE, isArgoKeyword } from '../app/lib/argo-flow.js';

const NOW = Date.now();
const ACCOUNT_ID = '17841401155694295';
const SENDER_ID = '200000001';
const automation = {
  id: '22222222-2222-4222-8222-222222222222',
  ig_account_id: ACCOUNT_ID,
  active: true,
  direct_keyword: 'ARGO',
  flow_version: 2,
  quick_reply_title: 'Ouvir áudio do Gui',
  quick_reply_payload: 'argo-audio-private-payload',
  audio_bucket: 'instagram-audio-tests',
  audio_path: 'owner/audio.m4a',
  menu_message: ARGO_MENU_MESSAGE,
  menu_buttons: ARGO_MENU_BUTTONS,
};

function mockToken(t) {
  const previous = process.env.META_INSTAGRAM_ACCESS_TOKEN;
  process.env.META_INSTAGRAM_ACCESS_TOKEN = 'test-token';
  t.after(() => { if (previous === undefined) delete process.env.META_INSTAGRAM_ACCESS_TOKEN; else process.env.META_INSTAGRAM_ACCESS_TOKEN = previous; });
}

function inboundMessage(overrides = {}) {
  return {
    object: 'instagram',
    entry: [{ id: ACCOUNT_ID, messaging: [{
      sender: { id: SENDER_ID }, recipient: { id: ACCOUNT_ID }, timestamp: NOW,
      message: { mid: 'incoming-argo', text: 'ARGO' }, ...overrides,
    }] }],
  };
}

function fakeDb(configurations = [automation]) {
  const db = {
    deliveries: [],
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://storage.example/private-audio.m4a?token=short-lived' } }) }) },
    from(table) {
      assert.ok([AUTOMATION_TABLE, DELIVERY_TABLE].includes(table));
      const filters = [];
      let insertValue = null;
      let patch = null;
      const query = {
        insert(value) { insertValue = value; return query; },
        update(value) { patch = value; return query; },
        select() { return query; },
        eq(key, value) { filters.push((row) => row[key] === value); return query; },
        in(key, values) { filters.push((row) => values.includes(row[key])); return query; },
        async maybeSingle() {
          if (table === AUTOMATION_TABLE) return { data: configurations.filter((row) => filters.every((filter) => filter(row))) };
          if (insertValue) {
            const duplicate = db.deliveries.some((row) => row.incoming_message_id === insertValue.incoming_message_id
              || (row.automation_id === insertValue.automation_id && row.recipient_id === insertValue.recipient_id && row.flow_version === insertValue.flow_version));
            if (duplicate) return { data: null, error: { code: '23505' } };
            const row = { id: `delivery-${db.deliveries.length + 1}`, ...insertValue };
            db.deliveries.push(row);
            return { data: { id: row.id }, error: null };
          }
          const row = db.deliveries.find((row) => filters.every((filter) => filter(row)));
          if (!row) return { data: null, error: null };
          if (patch) Object.assign(row, patch);
          return { data: { ...row }, error: null };
        },
        then(resolve, reject) { return query.maybeSingle().then(resolve, reject); },
      };
      return query;
    },
  };
  return db;
}

function captureSends(t) {
  mockToken(t);
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return Response.json({ message_id: requests.length === 1 ? 'audio-1' : 'menu-1' });
  });
  return requests;
}

test('only genuine inbound Direct messages inside 24 hours can trigger audio', () => {
  assert.equal(extractAudioSelectionEvents(inboundMessage(), NOW).length, 1);
  for (const override of [
    { message: { mid: 'm', text: '' } },
    { message: { mid: 'm', text: 'ARGO', is_echo: true } },
    { message: { mid: 'm', text: 'ARGO', is_deleted: true } },
    { sender: { id: ACCOUNT_ID } },
    { recipient: { id: 'another-account' } },
    { timestamp: NOW - (25 * 60 * 60 * 1000) },
    { timestamp: NOW + (6 * 60 * 1000) },
    { timestamp: undefined },
  ]) assert.equal(extractAudioSelectionEvents(inboundMessage(override), NOW).length, 0);
  assert.deepEqual(extractAudioSelectionEvents({ object: 'instagram', entry: [{ id: ACCOUNT_ID, changes: [{ field: 'comments', value: { text: 'ARGO' } }] }] }), []);
});

test('the Direct keyword tolerates casing and punctuation without matching unrelated text', () => {
  for (const text of ['ARGO', 'argo', ' Argo! ', '👋 ARGO 👊']) {
    assert.equal(matchesAudioTrigger({ text }, automation), true, text);
  }
  for (const text of ['largo', 'cargo', 'não quero ARGO', 'IMERSÃO', '', 'FORNECEDOR']) {
    assert.equal(matchesAudioTrigger({ text }, automation), false, text);
  }
  assert.equal(isArgoKeyword(' argo '), true);
  assert.equal(isArgoKeyword('FORNECEDOR'), false);
  assert.equal(matchesAudioTrigger({ quickReplyPayload: automation.quick_reply_payload }, automation), true);
  assert.equal(matchesAudioTrigger({ quickReplyPayload: 'unrelated-button', text: 'ARGO' }, automation), false);
});

test('ARGO delivers native audio first, then exactly three working URL buttons, once', async (t) => {
  const requests = captureSends(t);
  const db = fakeDb();
  await Promise.all([processAudioSelections(inboundMessage(), db), processAudioSelections(inboundMessage(), db)]);
  await processAudioSelections(inboundMessage(), db);
  await processAudioSelections(inboundMessage({ message: { mid: 'second-argo', text: 'argo' } }), db);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, `https://graph.instagram.com/v26.0/${ACCOUNT_ID}/messages`);
  assert.deepEqual(requests[0].body, {
    recipient: { id: SENDER_ID },
    message: { attachment: { type: 'audio', payload: { url: 'https://storage.example/private-audio.m4a?token=short-lived' } } },
  });
  assert.deepEqual(requests[1].body, {
    recipient: { id: SENDER_ID },
    message: { attachment: { type: 'template', payload: {
      template_type: 'button', text: ARGO_MENU_MESSAGE, buttons: ARGO_MENU_BUTTONS,
    } } },
  });
  assert.equal(db.deliveries[0].status, 'sent');
  assert.equal(db.deliveries[0].audio_message_id, 'audio-1');
  assert.equal(db.deliveries[0].menu_message_id, 'menu-1');
});

test('paused automations, other accounts, and unrelated messages never send', async (t) => {
  const requests = captureSends(t);
  await processAudioSelections(inboundMessage(), fakeDb([{ ...automation, active: false }]));
  await processAudioSelections(inboundMessage(), fakeDb([{ ...automation, ig_account_id: '99999' }]));
  await processAudioSelections(inboundMessage({ message: { mid: 'unrelated', text: 'Bom dia' } }), fakeDb());
  assert.equal(requests.length, 0);
});

test('a prior comment-flow recipient can explicitly enter the new Direct flow once', async (t) => {
  const requests = captureSends(t);
  const db = fakeDb();
  db.deliveries.push({ id: 'legacy', automation_id: automation.id, recipient_id: SENDER_ID, flow_version: 1, incoming_message_id: 'legacy-choice', status: 'sent' });
  await processAudioSelections(inboundMessage(), db);
  await processAudioSelections(inboundMessage(), db);
  assert.equal(requests.length, 2);
  assert.equal(db.deliveries.length, 2);
  assert.equal(db.deliveries[1].flow_version, 2);
});

test('a menu failure never repeats an already delivered audio', async (t) => {
  mockToken(t);
  let sends = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    if (++sends === 1) return Response.json({ message_id: 'audio-1' });
    throw new Error('timeout');
  });
  t.mock.method(console, 'error', () => {});
  const db = fakeDb();
  await processAudioSelections(inboundMessage(), db);
  await processAudioSelections(inboundMessage(), db);
  assert.equal(db.deliveries[0].status, 'partial');
  assert.equal(sends, 2);
});

test('invalid destinations are rejected before sending or consuming the recipient claim', async (t) => {
  const requests = captureSends(t);
  for (const invalid of [
    { ...automation, menu_buttons: [] },
    { ...automation, menu_buttons: ARGO_MENU_BUTTONS.map((button, index) => index ? button : { ...button, url: 'javascript:alert(1)' }) },
    { ...automation, menu_buttons: ARGO_MENU_BUTTONS.map((button, index) => index ? button : { ...button, title: 'x'.repeat(21) }) },
  ]) {
    const db = fakeDb();
    await assert.rejects(sendAudioDelivery(db, extractAudioSelectionEvents(inboundMessage())[0], invalid), { status: 422 });
    assert.equal(db.deliveries.length, 0);
  }
  assert.equal(requests.length, 0);
  assert.equal(buildAudioMenu(automation).attachment.payload.buttons.length, 3);
});
