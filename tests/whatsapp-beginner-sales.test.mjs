import test from 'node:test';
import assert from 'node:assert/strict';
import { processWhatsAppAutomation } from '../app/api/whatsapp/automation.js';
import { processWhatsAppAi } from '../app/api/whatsapp/ai.js';
import { BEGINNER_LINK, beginnerReply, classifyBeginner, pauseBeginnerFlow, processBeginnerFlow } from '../app/api/whatsapp/beginner-flow.mjs';
import { GET as health } from '../app/api/whatsapp/ai-health/route.js';

const answer = (props = {}) => ({ intent: 'answer', profile: 'zero', product: 'unknown', obstacle: 'unknown', confidence: 0.98, ...props });

function fakeDb() {
  const contact = { id: 'beginner-test', wa_id: '5511900000000', tags: ['Existing tag'], _wasExistingBeforeUpsert: true };
  const rows = { contact, messages: [], events: [], session: [] };
  let sequence = 0;
  function appendMessage(row) { rows.messages.push({ ...row, seq: ++sequence }); }
  const db = {
    rows, contact, appendMessage,
    from(table) {
      const collection = { whatsapp_contacts: 'contact', whatsapp_messages: 'messages', whatsapp_automation_events: 'events', whatsapp_automation_sessions: 'session' }[table];
      assert.ok(collection, 'Unexpected table: ' + table);
      let operation = 'select', value, single = false, descending = false, limit, count = false;
      const filters = [];
      const q = {
        select(_columns, options) { count = options?.count === 'exact'; return q; },
        insert(row) { operation = 'insert'; value = row; return q; },
        update(row) { operation = 'update'; value = row; return q; },
        upsert(row) { operation = 'upsert'; value = row; return q; },
        eq(key, val) { filters.push((row) => row[key] === val); return q; },
        order(_key, options) { descending = options?.ascending === false; return q; },
        limit(n) { limit = n; return q; },
        maybeSingle() { single = true; return q; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            const current = collection === 'contact' ? [contact] : rows[collection];
            if (operation === 'insert') {
              if (collection === 'events' && current.some((row) => row.message_id === value.message_id)) return { error: { code: '23505' } };
              if (collection === 'messages') appendMessage(value); else current.push({ ...value });
            } else if (operation === 'upsert') {
              const existing = current.find((row) => row.contact_id === value.contact_id);
              if (existing) Object.assign(existing, value); else current.push({ ...value });
            } else if (operation === 'update') {
              current.filter((row) => filters.every((fn) => fn(row))).forEach((row) => Object.assign(row, value));
            }
            let data = current.filter((row) => filters.every((fn) => fn(row)));
            if (descending) data = [...data].sort((a, b) => (b.seq || 0) - (a.seq || 0));
            if (limit) data = data.slice(0, limit);
            return { data: single ? data[0] || null : data, count: count ? data.length : undefined, error: null };
          }).then(resolve, reject);
        },
      };
      return q;
    },
  };
  return db;
}

async function withTransport(run) {
  const fetch = globalThis.fetch;
  const keys = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'META_WHATSAPP_ACCESS_TOKEN', 'META_WHATSAPP_PHONE_NUMBER_ID', 'GEMINI_API_KEY'];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-key', META_WHATSAPP_ACCESS_TOKEN: 'test-token', META_WHATSAPP_PHONE_NUMBER_ID: '123456', GEMINI_API_KEY: 'test-only-key' });
  const transport = { sent: [], prompts: [], decision: answer(), failAi: false };
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://example.supabase.co/')) return Response.json([]);
    if (String(url).startsWith('https://generativelanguage.googleapis.com/')) {
      transport.prompts.push(JSON.parse(options.body));
      if (transport.failAi) throw new Error('test provider unavailable');
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(transport.decision) }] } }] });
    }
    assert.match(String(url), /^https:\/\/graph.facebook.com\//);
    transport.sent.push(JSON.parse(options.body));
    return Response.json({ messages: [{ id: 'sent-' + transport.sent.length }] });
  };
  try { await run(transport); } finally {
    globalThis.fetch = fetch;
    for (const key of keys) if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key];
  }
}

function incoming(db, text, id = 'in-' + db.rows.events.length) {
  const message = { id, type: 'text', text: { body: text } };
  db.appendMessage({ meta_message_id: id, contact_id: db.contact.id, direction: 'inbound', body: text, raw_payload: {}, sent_at: new Date().toISOString() });
  return message;
}
async function send(db, text, id) {
  return processWhatsAppAutomation(db, { contact: db.contact, message: incoming(db, text, id), origin: 'https://social-hub-gui.vercel.app' });
}
async function start(db) {
  return processWhatsAppAutomation(db, { contact: db.contact, message: { id: 'start', type: 'interactive', interactive: { list_reply: { id: 'topic_mercado_livre' } } } });
}

test('beginner text conversation qualifies in two questions, offers fixed terms and sends the official link only after consent', async () => {
  await withTransport(async (t) => {
    const db = fakeDb();
    await start(db);
    assert.match(t.sent[0].text.body, /começando do zero/);
    assert.equal(db.rows.session[0].state, 'beginner_profile');
    t.decision = answer();
    const result = await send(db, 'Nunca vendi');
    assert.equal(result.action, 'beginner_sales_conversation');
    assert.equal((await processWhatsAppAi(db, { automationResult: result })).reason, 'automation_owned');
    assert.equal(db.rows.session[0].state, 'beginner_context');
    assert.match(t.sent.at(-1).text.body, /algum produto em mente/);
    t.decision = answer({ product: 'searching' });
    await send(db, 'Ainda não sei o que vender');
    const offer = t.sent.at(-1).text.body;
    assert.match(offer, /escolher o produto/);
    assert.match(offer, /30 horas/);
    assert.match(offer, /acesso vitalício/);
    assert.match(offer, /R\$197 no Pix ou 12x de R\$20,37/);
    assert.doesNotMatch(offer, /https?:/);
    assert.equal(db.contact.stage, 'Interessado');
    t.decision = answer({ intent: 'link' });
    await send(db, 'Pode mandar o link');
    assert.ok(t.sent.at(-1).text.body.includes(BEGINNER_LINK));
    assert.equal(db.contact.stage, 'Link enviado');
    assert.equal(db.rows.session[0].state, 'beginner_link');
    assert.ok(t.sent.every((payload) => payload.type === 'text'));
  });
});

test('direct price and purchase requests skip qualification; known context avoids repeated questions', async () => {
  const price = beginnerReply('beginner_profile', answer({ intent: 'price' }));
  assert.match(price.text, /R\$197/);
  assert.equal(price.state, 'beginner_offer');
  assert.ok(beginnerReply('beginner_profile', answer({ intent: 'link' })).text.includes(BEGINNER_LINK));
  assert.equal(beginnerReply('beginner_profile', answer({ product: 'defined' })).state, 'beginner_offer');
  assert.match(beginnerReply('beginner_profile', answer({ profile: 'tried' })).text, /dificultou/);
  assert.match(beginnerReply('beginner_context', answer({ obstacle: 'ads' })).text, /Product Ads/);
});

test('unconfirmed details, refunds and purchase claims hand off without inventing support or marking a sale', async () => {
  for (const intent of ['support', 'human', 'capital', 'purchased', 'unknown']) {
    const reply = beginnerReply('beginner_offer', answer({ intent }));
    assert.equal(reply.state, 'beginner_human');
    assert.notEqual(reply.stage, 'Venda');
    assert.doesNotMatch(reply.text, /suporte vitalício|garantia de|reembolso garantido/);
  }
  const mentor = beginnerReply('beginner_profile', answer({ intent: 'mentoria' }));
  assert.equal(mentor.topic, 'Mentoria');
  assert.equal(mentor.state, 'beginner_human');
  assert.match(mentor.text, /produto ou nicho/);
  const closed = beginnerReply('beginner_offer', answer({ intent: 'stop' }));
  assert.equal(closed.state, 'beginner_closed');
});

test('provider failure hands off once, duplicate events and subsequent messages stay silent', async () => {
  await withTransport(async (t) => {
    const db = fakeDb(); await start(db);
    t.failAi = true;
    await send(db, 'Estou começando', 'failure-inbound');
    assert.equal(db.rows.session[0].state, 'beginner_human');
    const count = t.sent.length;
    assert.equal((await send(db, 'Estou começando', 'failure-inbound')).reason, 'duplicate');
    await send(db, 'Obrigado');
    assert.equal(t.sent.length, count);
  });
});

test('manual TidePlace and WhatsApp app replies pause this flow; other topics remain unchanged', async () => {
  await withTransport(async (t) => {
    const db = fakeDb(); await start(db);
    db.appendMessage({ contact_id: db.contact.id, direction: 'outbound', body: 'Oi, aqui é a Ju', raw_payload: {} });
    await send(db, 'Oi');
    assert.equal(t.sent.length, 1);
    assert.equal(db.rows.session[0].state, 'beginner_human');
    await send(db, 'menu');
    assert.equal(db.rows.session[0].state, 'menu_sent');
    assert.equal(await pauseBeginnerFlow(db, db.contact.id), false);
    await processWhatsAppAutomation(db, { contact: db.contact, message: { id: 'importacao-menu', type: 'interactive', interactive: { list_reply: { id: 'topic_importacao' } } } });
    assert.equal(db.rows.session[0].state, 'importacao_waiting_operacao');
    assert.equal(await pauseBeginnerFlow(db, db.contact.id), false);
  });
});

test('a human takeover or newer inbound during classification suppresses the older automated reply', async () => {
  await withTransport(async (t) => {
    for (const takeover of [true, false]) {
      const db = fakeDb(); await start(db);
      const message = incoming(db, 'Nunca vendi');
      const session = { ...db.rows.session[0] };
      const before = t.sent.length;
      await processBeginnerFlow(db, { contact: db.contact, message, session }, async () => {
        if (takeover) await pauseBeginnerFlow(db, db.contact.id);
        else incoming(db, 'Outra mensagem', 'newer-message');
        return answer();
      });
      assert.equal(t.sent.length, before);
    }
  });
});

test('classifier ignores generated sales copy and malformed output; health probe never sends WhatsApp messages', async () => {
  await assert.rejects(classifyBeginner('test', async () => ({ intent: 'delete_data', confidence: 1 })));
  const result = await classifyBeginner('test', async () => ({ ...answer(), reply_text: 'R$1 promoção', next_action: 'send_anything' }));
  assert.equal(result.reply_text, undefined);
  await withTransport(async (t) => {
    t.decision = answer({ product: 'searching' });
    const response = await health(new Request('https://example.com/api/whatsapp/ai-health?flow=beginner'));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    assert.equal(t.sent.length, 0);
    assert.match(t.prompts[0].system_instruction.parts[0].text, /não confiável/);
  });
});
