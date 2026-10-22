import test from 'node:test';
import assert from 'node:assert/strict';
import { IMPORTACAO_QUESTIONS, processWhatsAppAutomation } from '../app/api/whatsapp/automation.js';
import { processWhatsAppAi } from '../app/api/whatsapp/ai.js';
import { buildWhatsAppReplyButtonsMessage } from '../app/api/whatsapp/reply-buttons.js';

function fakeDb() {
  const contact = { id: 'test-contact', wa_id: '5511900000000', tags: ['Existing tag'] };
  const rows = { session: null, messages: [], events: new Map(), contact };
  return {
    contact, rows,
    from(table) {
      let operation, value;
      const query = {
        insert(row) { operation = 'insert'; value = row; return query; },
        update(row) { operation = 'update'; value = row; return query; },
        upsert(row) { operation = 'upsert'; value = row; return query; },
        select() { operation ||= 'select'; return query; },
        eq() { return query; },
        maybeSingle() { return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (table === 'whatsapp_automation_events') {
              if (operation === 'insert') {
                if (rows.events.has(value.message_id)) return { error: { code: '23505' } };
                rows.events.set(value.message_id, value);
              }
            } else if (table === 'whatsapp_automation_sessions') {
              if (operation === 'select') return { data: rows.session, error: null };
              rows.session = { ...rows.session, ...value };
            } else if (table === 'whatsapp_contacts') {
              Object.assign(contact, value);
            } else if (table === 'whatsapp_messages') {
              if (operation === 'select') return { count: 10, error: null };
              rows.messages.push(value);
            } else throw new Error('Unexpected table ' + table);
            return { error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

async function withTransport(run) {
  const originalFetch = globalThis.fetch;
  const keys = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'META_WHATSAPP_ACCESS_TOKEN', 'META_WHATSAPP_PHONE_NUMBER_ID'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';
  process.env.META_WHATSAPP_ACCESS_TOKEN = 'test-only-token';
  process.env.META_WHATSAPP_PHONE_NUMBER_ID = '123456';
  const sent = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://example.supabase.co/')) {
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    assert.match(String(url), /^https:\/\/graph.facebook.com\//);
    sent.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ messages: [{ id: 'test-sent-' + sent.length }] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  try { await run(sent); } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

function send(db, selectionId, id = 'message-' + db.rows.events.size) {
  return processWhatsAppAutomation(db, {
    contact: db.contact,
    origin: 'https://social-hub-gui.vercel.app',
    message: { id, type: 'interactive', interactive: { button_reply: { id: selectionId } } },
  });
}

test('the original four qualification questions and choices fit actual Meta payload limits', () => {
  assert.deepEqual(IMPORTACAO_QUESTIONS.map((q) => q.key), ['operacao', 'experiencia', 'produto', 'investimento']);
  assert.deepEqual(IMPORTACAO_QUESTIONS[3].buttons.map((b) => b.title), ['Até R$ 5 mil', 'Até R$ 100 mil', 'Mais de R$ 500 mil']);
  for (const q of IMPORTACAO_QUESTIONS) {
    assert.equal(q.buttons.length, 3);
    const payload = buildWhatsAppReplyButtonsMessage({ to: '5511900000000', body: q.text, buttons: q.buttons });
    assert.deepEqual(payload.interactive.action.buttons.map((b) => b.reply), q.buttons);
    assert.equal(payload.interactive.body.text, q.text);
  }
});

test('Importação menu runs all steps once, saves answers and hands off without requesting the number', async () => {
  await withTransport(async (sent) => {
    const db = fakeDb();
    assert.equal((await send(db, 'topic_importacao')).handled, true);
    assert.equal(sent.length, 1);
    assert.equal(db.rows.session.state, 'importacao_waiting_operacao');
    for (let i = 0; i < IMPORTACAO_QUESTIONS.length; i += 1) {
      const answer = IMPORTACAO_QUESTIONS[i].buttons[0];
      const messageId = 'answer-' + i;
      const result = await send(db, answer.id, messageId);
      assert.equal(result.handled, true);
      assert.ok(db.contact.tags.includes('Importação · ' + IMPORTACAO_QUESTIONS[i].tag + ': ' + answer.title));
      const count = sent.length;
      assert.equal((await send(db, answer.id, messageId)).reason, 'duplicate');
      assert.equal(sent.length, count);
      assert.equal((await processWhatsAppAi(db, { contact: db.contact, message: { type: 'text' }, automationResult: result })).reason, 'automation_owned');
    }
    assert.equal(sent.length, 5);
    assert.equal(db.rows.session.current_topic, 'Importação');
    assert.equal(db.rows.session.state, 'importacao_awaiting_human');
    assert.equal(db.contact.stage, 'Aguardando atendimento');
    assert.ok(db.contact.tags.includes('Existing tag'));
    assert.ok(db.contact.tags.includes('Importação · Qualificação concluída'));
    assert.match(sent.at(-1).text.body, /continuar o atendimento por aqui/);
    assert.doesNotMatch(JSON.stringify(sent), /deixe seu contato|seu número|comentário|instagram/i);
    await send(db, IMPORTACAO_QUESTIONS[3].buttons[0].id);
    assert.equal(sent.length, 5);
  });
});

test('stale answers cannot skip steps; menu can exit; other topics still work', async () => {
  await withTransport(async (sent) => {
    const db = fakeDb();
    await send(db, 'topic_importacao');
    await send(db, IMPORTACAO_QUESTIONS[3].buttons[1].id);
    assert.equal(db.rows.session.state, 'importacao_waiting_operacao');
    assert.equal(sent.at(-1).interactive.action.buttons[0].reply.id, IMPORTACAO_QUESTIONS[0].buttons[0].id);
    await processWhatsAppAutomation(db, {
      contact: db.contact, message: { id: 'menu-exit', type: 'text', text: { body: 'menu' } },
    });
    assert.equal(db.rows.session.state, 'menu_sent');
    await send(db, 'topic_mentoria');
    assert.equal(db.rows.session.current_topic, 'Mentoria');
    assert.equal(db.rows.session.state, 'routed');
    const count = sent.length;
    await send(db, IMPORTACAO_QUESTIONS[0].buttons[0].id);
    assert.equal(sent.length, count);
    assert.equal(db.rows.session.current_topic, 'Mentoria');
  });
});

test('restarting Importação replaces previous qualification tags without changing unrelated tags', async () => {
  await withTransport(async () => {
    const db = fakeDb();
    db.contact.tags.push('Importação · Operação: Sim, já vendo', 'Importação · Qualificação concluída');
    await send(db, 'topic_importacao');
    assert.deepEqual(db.contact.tags, ['Existing tag', 'Interesse — Importação']);
    await send(db, IMPORTACAO_QUESTIONS[0].buttons[2].id);
    assert.ok(db.contact.tags.includes('Importação · Operação: Ainda não vendo'));
    assert.equal(db.rows.session.state, 'importacao_waiting_experiencia');
  });
});
