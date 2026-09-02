import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DELIVERY_TABLE,
  extractAudioSelectionEvents,
  findAudioAutomationForComment,
  sendAudioPrompt,
  sendAudioDelivery,
} from '../app/api/instagram/audio-automation/service.js';

const NOW = Date.now();
const ACCOUNT_ID = '17841401155694295';
const SENDER_ID = '200000001';
const DELIVERY_ID = '11111111-1111-4111-8111-111111111111';
const automation = {
  id: '22222222-2222-4222-8222-222222222222',
  comment_keyword: 'ARGO',
  quick_reply_title: 'Ouvir áudio do Gui',
  quick_reply_payload: 'argo-audio-private-payload',
  audio_bucket: 'instagram-audio-tests',
  audio_path: 'owner/audio.m4a',
  whatsapp_message: 'Quer mais informações sobre o ARGO? Chama a equipe no WhatsApp: (11) 92399-0244 👊',
};

function mockEnv(t, key, value) {
  const previous = process.env[key];
  process.env[key] = value;
  t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
}

function inboundMessage(overrides = {}) {
  return {
    object: 'instagram',
    entry: [{
      id: ACCOUNT_ID,
      messaging: [{
        sender: { id: SENDER_ID },
        recipient: { id: ACCOUNT_ID },
        timestamp: NOW,
        message: {
          mid: 'incoming-audio-choice',
          text: 'Ouvir áudio do Gui',
          quick_reply: { payload: automation.quick_reply_payload },
        },
        ...overrides,
      }],
    }],
  };
}

function fakeDeliveryDb() {
  const db = {
    delivery: null,
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: { signedUrl: 'https://storage.example/private-audio.m4a?token=short-lived' } }),
      }),
    },
    from(table) {
      assert.equal(table, DELIVERY_TABLE);
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
          if (insertValue) {
            if (db.delivery) return { data: null, error: { code: '23505' } };
            db.delivery = { id: DELIVERY_ID, ...insertValue };
            return { data: { id: DELIVERY_ID }, error: null };
          }
          if (!db.delivery || !filters.every((filter) => filter(db.delivery))) return { data: null, error: null };
          if (patch) Object.assign(db.delivery, patch);
          return { data: { ...db.delivery }, error: null };
        },
        then(resolve, reject) { return query.maybeSingle().then(resolve, reject); },
      };
      return query;
    },
  };
  return db;
}

test('only a recent inbound Direct choice can enter the ARGO audio flow', () => {
  const events = extractAudioSelectionEvents(inboundMessage(), NOW);
  assert.equal(events.length, 1);
  assert.equal(events[0].quickReplyPayload, automation.quick_reply_payload);

  for (const override of [
    { message: { mid: 'm', text: '', quick_reply: {} } },
    { message: { mid: 'm', text: 'Ouvir áudio do Gui', is_echo: true } },
    { sender: { id: ACCOUNT_ID } },
    { recipient: { id: 'another-account' } },
    { timestamp: NOW - (9 * 24 * 60 * 60 * 1000) },
  ]) {
    assert.equal(extractAudioSelectionEvents(inboundMessage(override), NOW).length, 0);
  }
});

test('ARGO comments match the official automation before the normal text rules', () => {
  assert.equal(findAudioAutomationForComment('Quero conhecer o argo', [automation]), automation);
  assert.equal(findAudioAutomationForComment('Quero saber da imersão', [automation]), null);
});

test('an ARGO comment receives one Direct prompt with the voice button', async (t) => {
  mockEnv(t, 'META_INSTAGRAM_ACCESS_TOKEN', 'test-token');
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return Response.json({ message_id: 'prompt-1' });
  });

  const configured = {
    ...automation,
    prompt_message: 'O Gui deixou um áudio rápido explicando. Toca aqui embaixo.',
  };
  await sendAudioPrompt(ACCOUNT_ID, 'comment-1', configured);
  assert.equal(requests[0].url, `https://graph.instagram.com/v26.0/${ACCOUNT_ID}/messages`);
  assert.deepEqual(requests[0].body, {
    recipient: { comment_id: 'comment-1' },
    message: {
      text: configured.prompt_message,
      quick_replies: [{
        content_type: 'text',
        title: automation.quick_reply_title,
        payload: automation.quick_reply_payload,
      }],
    },
  });
});

test('one Direct choice sends native audio followed by the WhatsApp message once', async (t) => {
  mockEnv(t, 'META_INSTAGRAM_ACCESS_TOKEN', 'test-token');
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return Response.json({ message_id: requests.length === 1 ? 'audio-1' : 'whatsapp-1' });
  });

  const db = fakeDeliveryDb();
  const event = extractAudioSelectionEvents(inboundMessage(), NOW)[0];
  assert.deepEqual(await Promise.all([
    sendAudioDelivery(db, event, automation),
    sendAudioDelivery(db, event, automation),
  ]), [true, false]);
  assert.equal(await sendAudioDelivery(db, event, automation), false);

  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].body, {
    recipient: { id: SENDER_ID },
    message: { attachment: { type: 'audio', payload: { url: 'https://storage.example/private-audio.m4a?token=short-lived' } } },
  });
  assert.deepEqual(requests[1].body, {
    recipient: { id: SENDER_ID },
    message: { text: automation.whatsapp_message },
  });
  assert.equal(db.delivery.status, 'sent');
  assert.equal(db.delivery.audio_message_id, 'audio-1');
  assert.equal(db.delivery.whatsapp_message_id, 'whatsapp-1');
});

test('a WhatsApp text failure never resends an already delivered audio', async (t) => {
  mockEnv(t, 'META_INSTAGRAM_ACCESS_TOKEN', 'test-token');
  let sends = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    sends += 1;
    if (sends === 1) return Response.json({ message_id: 'audio-1' });
    throw new Error('timeout');
  });
  t.mock.method(console, 'error', () => {});

  const db = fakeDeliveryDb();
  const event = extractAudioSelectionEvents(inboundMessage(), NOW)[0];
  await sendAudioDelivery(db, event, automation);
  assert.equal(db.delivery.status, 'partial');
  assert.equal(await sendAudioDelivery(db, event, automation), false);
  assert.equal(sends, 2);
});
