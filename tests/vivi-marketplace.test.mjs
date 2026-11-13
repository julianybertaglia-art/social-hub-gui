import test from 'node:test';
import assert from 'node:assert/strict';
import { handleViviMessage } from '../app/api/vital-connections/vivi-flow.mjs';

const connection = {
  id: 'test-vital', owner_user_id: 'test-owner',
  external_account_id: '123456789', access_token: 'local-test-placeholder',
};

function fakeDatabase(stage = 'order_channel', selection = null) {
  const writes = [];
  return {
    writes,
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        neq() { return this; },
        lt() { return this; },
        lte() { return this; },
        order() { return this; },
        limit() { return this; },
        maybeSingle() {
          if (table === 'vital_whatsapp_flow_configs') {
            return Promise.resolve({ data: { enabled: true }, error: null });
          }
          if (table === 'vital_whatsapp_flow_sessions') {
            return Promise.resolve({ data: { stage, selection, human_handoff: false, manual_override: false, last_interaction_at: new Date().toISOString(), updated_at: new Date().toISOString() }, error: null });
          }
          if (table === 'vital_whatsapp_sector_settings') {
            return Promise.resolve({ data: null, error: null });
          }
          throw new Error('Unexpected lookup: ' + table);
        },
        insert(data) {
          writes.push({ table, action: 'insert', data });
          return Promise.resolve({ error: null });
        },
        upsert(data) {
          writes.push({ table, action: 'upsert', data });
          return Promise.resolve({ error: null });
        },
        update(data) {
          writes.push({ table, action: 'update', data });
          return this;
        },
        then(resolve, reject) {
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
    },
  };
}

async function simulateChoice(choice, rejectSend = false, stage = 'order_channel', selection = null) {
  const db = fakeDatabase(stage, selection);
  const sent = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    sent.push({ url, payload: JSON.parse(options.body) });
    const response = rejectSend
      ? { error: { code: 10 } }
      : { messages: [{ id: 'wamid.local-test' }] };
    return new Response(JSON.stringify(response), { status: rejectSend ? 400 : 200 });
  };
  let error = null;
  try {
    await handleViviMessage(db, connection, {
      id: 'inbound-test-' + choice, from: '11111111111',
      interactive: { list_reply: { id: choice } },
    }, 'https://example.invalid');
  } catch (caught) {
    error = caught;
  } finally {
    globalThis.fetch = previousFetch;
  }
  return { db, sent, error };
}

test('Vivi directs the three marketplace order options to the corresponding platform', async () => {
  for (const [choice, platform] of [
    ['vivi_order_shopee', 'Shopee'],
    ['vivi_order_mercadolivre', 'Mercado Livre'],
    ['vivi_order_tiktok', 'TikTok Shop'],
  ]) {
    const { db, sent, error } = await simulateChoice(choice);
    assert.equal(error, null);
    assert.equal(sent.length, 1);
    assert.ok(sent[0].url.endsWith('/123456789/messages'));
    const message = sent[0].payload;
    assert.equal(message.type, 'text');
    assert.equal(message.to, '11111111111');
    assert.ok(message.text.body.includes('*' + platform + '*'));
    assert.match(message.text.body, /chat/);
    assert.match(message.text.body, /chamado/);
    assert.match(message.text.body, /pós-venda.*exclusivamente/s);
    assert.match(message.text.body, /MENU/);
    assert.doesNotMatch(message.text.body, /número do pedido/);
    assert.doesNotMatch(message.text.body, /continuar o atendimento por aqui/);

    const session = db.writes.find(write => write.table === 'vital_whatsapp_flow_sessions' && write.action === 'upsert');
    assert.equal(session.data.human_handoff, true);
    assert.equal(session.data.selection, 'Pós-venda · ' + platform);
    const assignment = db.writes.find(write => write.table === 'vital_whatsapp_assignments' && write.action === 'upsert');
    assert.equal(assignment.data.sector, 'pos_venda');
    assert.ok(db.writes.some(write => write.table === 'vital_whatsapp_flow_events' && write.data.status === 'completed'));
  }
});

test('site and Amazon orders retain their existing WhatsApp support flow', async () => {
  for (const choice of ['vivi_order_site', 'vivi_order_amazon']) {
    const { db, sent, error } = await simulateChoice(choice);
    assert.equal(error, null);
    assert.equal(sent.length, 1);
    assert.match(sent[0].payload.text.body, /nome completo/);
    assert.match(sent[0].payload.text.body, /número do pedido/);
    assert.match(sent[0].payload.text.body, /continuar o atendimento por aqui/);
    assert.doesNotMatch(sent[0].payload.text.body, /exclusivamente dentro da plataforma/);
    assert.ok(db.writes.some(write => write.table === 'vital_whatsapp_assignments' && write.action === 'upsert'));
  }
});

test('when Meta refuses a marketplace message, Vivi records failure without changing its session', async () => {
  const { db, sent, error } = await simulateChoice('vivi_order_shopee', true);
  assert.equal(sent.length, 1);
  assert.match(error.message, /Meta recusou envio da Vivi/);
  assert.ok(db.writes.some(write => write.table === 'vital_whatsapp_flow_events' && write.data.status === 'failed'));
  assert.equal(db.writes.some(write => write.table === 'vital_whatsapp_flow_sessions' && write.action === 'upsert'), false);
  assert.equal(db.writes.some(write => write.table === 'vital_whatsapp_assignments' && write.action === 'upsert'), false);
});

test('Vital product selection opens guided categories without handing the customer off', async () => {
  const { db, sent, error } = await simulateChoice('vivi_product_vital', false, 'products');
  assert.equal(error, null);
  assert.equal(sent.length, 2);
  assert.match(sent[0].payload.text.body, /vendedora online/);
  assert.equal(sent[1].payload.interactive.type, 'list');
  assert.deepEqual(sent[1].payload.interactive.action.sections[0].rows.map(row => row.id), [
    'vivi_sales_garden', 'vivi_sales_grass', 'vivi_sales_3d', 'vivi_sales_adhesive', 'vivi_sales_plants', 'vivi_sales_human',
  ]);
  const session = db.writes.find(write => write.table === 'vital_whatsapp_flow_sessions' && write.action === 'upsert');
  assert.equal(session.data.stage, 'vital_sales');
  assert.equal(session.data.selection, 'Produtos Vital Decor');
  assert.equal(session.data.human_handoff, false);
});

test('Vivi sends the current official catalog search and only hands off when the customer asks', async () => {
  const product = await simulateChoice('vivi_sales_adhesive', false, 'vital_sales', 'Produtos Vital Decor');
  assert.equal(product.error, null);
  assert.equal(product.sent.length, 1);
  assert.match(product.sent[0].payload.text.body, /https:\/\/vitaldecor\.com\.br\/search\/\?q=placa\+adesiva\+marmore/);
  assert.match(product.sent[0].payload.text.body, /preços e a disponibilidade/);
  const productSession = product.db.writes.find(write => write.table === 'vital_whatsapp_flow_sessions' && write.action === 'upsert');
  assert.equal(productSession.data.stage, 'vital_sales');
  assert.equal(productSession.data.human_handoff, false);

  const human = await simulateChoice('vivi_sales_human', false, 'vital_sales', 'Produtos Vital Decor');
  assert.equal(human.error, null);
  assert.equal(human.sent.length, 1);
  assert.match(human.sent[0].payload.text.body, /encaminhar sua conversa/);
  const humanSession = human.db.writes.find(write => write.table === 'vital_whatsapp_flow_sessions' && write.action === 'upsert');
  assert.equal(humanSession.data.stage, 'await_human');
  assert.equal(humanSession.data.human_handoff, true);
});

