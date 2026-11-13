import test from 'node:test';
import assert from 'node:assert/strict';
import { startNinaMentoria, startNinaOther, processNinaFlow, pauseNinaFlow, NINA_MENTORIA_OPTIONS } from '../app/api/whatsapp/nina-flow.mjs';
import { buildWhatsAppReplyButtonsMessage } from '../app/api/whatsapp/reply-buttons.js';

function fakeDb() {
  const contact = { id: 'contact-nina', wa_id: '5511900000000', profile_name: null, tags: ['Prioridade'], notes: 'Nota existente', stage: 'Novo lead' };
  const rows = { messages: [], session: null, contact };
  let seq = 0;
  const db = {
    contact, rows,
    from(table) {
      let operation = 'select', value, desc = false, count = null;
      const filters = [];
      const q = {
        select() { return q; },
        maybeSingle() { return q; },
        insert(v) { operation = 'insert'; value = v; return q; },
        update(v) { operation = 'update'; value = v; return q; },
        upsert(v) { operation = 'upsert'; value = v; return q; },
        eq(k, v) { filters.push((row) => row[k] === v); return q; },
        order(_key, opts) { desc = opts?.ascending === false; return q; },
        limit(v) { count = v; return q; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (table === 'whatsapp_messages') {
              if (operation === 'insert') rows.messages.push({ ...value, seq: ++seq });
              let data = rows.messages.filter((row) => filters.every((fn) => fn(row)));
              if (desc) data = [...data].sort((a, b) => b.seq - a.seq);
              if (count) data = data.slice(0, count);
              return { data, error: null };
            }
            if (table === 'whatsapp_automation_sessions') {
              if (operation === 'upsert') rows.session = { ...rows.session, ...value };
              if (operation === 'update') Object.assign(rows.session, value);
              return { data: rows.session, error: null };
            }
            if (table === 'whatsapp_contacts') {
              if (operation === 'update') Object.assign(contact, value);
              return { data: contact, error: null };
            }
            throw new Error('unexpected table: ' + table);
          }).then(resolve, reject);
        },
      };
      return q;
    },
  };
  return db;
}
async function transport(run) {
  const oldFetch = globalThis.fetch;
  const vars = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'META_WHATSAPP_ACCESS_TOKEN', 'META_WHATSAPP_PHONE_NUMBER_ID'];
  const old = Object.fromEntries(vars.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-only-key',
    META_WHATSAPP_ACCESS_TOKEN: 'test-only-token',
    META_WHATSAPP_PHONE_NUMBER_ID: '123456',
  });
  const sent = [];
  globalThis.fetch = async (url, opts) => {
    if (String(url).startsWith('https://example.supabase.co')) return Response.json([]);
    assert.match(String(url), /^https:\/\/graph.facebook.com\//);
    sent.push(JSON.parse(opts.body));
    return Response.json({ messages: [{ id: 'sent-' + sent.length }] });
  };
  try { await run(sent); } finally {
    globalThis.fetch = oldFetch;
    for (const key of vars) if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key];
  }
}
async function reply(db, body, id) {
  const message = id
    ? { type: 'interactive', interactive: { list_reply: { id } } }
    : { type: 'text', text: { body } };
  db.rows.messages.push({
    direction: 'inbound', meta_message_id: 'lead-' + db.rows.messages.length,
    contact_id: db.contact.id, body: body || id,
    seq: db.rows.messages.length + 1,
  });
  return processNinaFlow(db, { contact: db.contact, message, session: { ...db.rows.session } });
}

test('Mentoria Ultra captures all six approved data points and pauses for Juliany', async () => {
  await transport(async (sent) => {
    const db = fakeDb();
    await startNinaMentoria(db, db.contact);
    assert.match(sent.at(-1).text.body, /previsibilidade/);
    await reply(db, 'Rafael');
    await reply(db, '', 'nina_operacao_sim');
    await reply(db, '', 'nina_colab_3a5');
    await reply(db, 'SP');
    await reply(db, '', 'nina_fat_50a100');
    await reply(db, 'Quero melhorar a margem e escalar');
    assert.equal(db.rows.session.state, 'nina_awaiting_human');
    assert.equal(db.contact.stage, 'Aguardando atendimento');
    assert.equal(db.contact.profile_name, 'Rafael');
    assert.match(db.contact.notes, /Nota existente/);
    assert.match(db.contact.notes, /R\$ 50 a 100 mil/);
    assert.match(db.contact.notes, /Quero melhorar a margem e escalar/);
    assert.match(sent.at(-1).text.body, /Juliany/);
    const count = sent.length;
    await reply(db, 'Obrigada');
    assert.equal(sent.length, count, 'Assistant must stay silent after handoff');
  });
});

test('beginner with capital can apply without automatic course promotion', async () => {
  await transport(async (sent) => {
    const db = fakeDb();
    await startNinaMentoria(db, db.contact);
    await reply(db, 'Ana');
    await reply(db, '', 'nina_operacao_nao');
    assert.match(sent.at(-2).text.body, /mais indicada/);
    await reply(db, '', 'nina_capital_sim');
    await reply(db, '', 'nina_inv_50a100');
    await reply(db, 'Minas Gerais');
    await reply(db, 'Quero começar um negócio estruturado');
    assert.equal(db.rows.session.state, 'nina_awaiting_human');
    assert.match(db.contact.notes, /Investimento previsto: R\$ 50 a 100 mil/);
    assert.doesNotMatch(sent.map((x) => x.text?.body || x.interactive?.body?.text || '').join(' '), /R\$197|Destravando/);
  });
});

test('other subject saves name and request and routes to a person', async () => {
  await transport(async (sent) => {
    const db = fakeDb();
    await startNinaOther(db, db.contact);
    assert.match(sent.at(-1).text.body, /nome e sobre qual assunto/);
    await reply(db, 'Marina - Quero falar de parceria com o Gui');
    assert.equal(db.rows.session.state, 'nina_awaiting_human');
    assert.equal(db.contact.profile_name, 'Marina');
    assert.match(db.contact.notes, /parceria/);
    assert.equal(db.contact.stage, 'Aguardando atendimento');
  });
});

test('human manual response stops Nina and Meta quick replies never exceed three buttons', async () => {
  await transport(async (sent) => {
    const db = fakeDb();
    await startNinaMentoria(db, db.contact);
    db.rows.messages.push({ direction: 'outbound', raw_payload: { human: true }, seq: 99 });
    // Manual TidePlace sends call pauseNinaFlow at the moment the agent replies.
    assert.equal(await pauseNinaFlow(db, db.contact.id), true);
    const before = sent.length;
    await reply(db, 'Olha, gostaria da mentoria');
    assert.equal(db.rows.session.state, 'nina_human');
    assert.equal(sent.length, before);
    for (const options of [NINA_MENTORIA_OPTIONS.operacao, NINA_MENTORIA_OPTIONS.capital]) {
      const payload = buildWhatsAppReplyButtonsMessage({ to: '5511900000000', body: 'Teste', buttons: options });
      assert.ok(payload.interactive.action.buttons.length <= 3);
      assert.ok(payload.interactive.action.buttons.every((button) => button.reply.title.length <= 20));
    }
  });
});
