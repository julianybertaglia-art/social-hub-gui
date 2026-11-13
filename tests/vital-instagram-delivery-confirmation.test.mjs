import test from 'node:test';
import assert from 'node:assert/strict';
import { processVitalInstagramDirect } from '../app/api/vital-connections/instagram/direct.mjs';

const vital = '17841439121395170';
const gui = '17841401155694295';
const customer = '1234567890123';
const message = (account = vital) => ({
  object: 'instagram',
  entry: [{ id: account, messaging: [{
    sender: { id: customer }, recipient: { id: account },
    message: { mid: 'incoming-message-1', text: 'Olá' },
  }] }],
});

// This fake models the relevant existing database constraints without touching
// Supabase, Meta, or any real person's account.
function fakeDb({ enabled = true, claim = true, insertError = null, username = 'vitaldecor_' } = {}) {
  const receipts = new Map();
  const connection = {
    id: 'vital-connection', workspace_id: 'vital-decor', platform: 'instagram',
    external_account_id: vital, username, access_token: 'test-token', auth_provider: 'instagram_login',
    state: 'connected', automatic_replies_enabled: enabled,
  };
  const rpcCalls = [];
  return {
    receipts,
    rpcCalls,
    async rpc(name, args) {
      rpcCalls.push({ name, args });
      return { data: claim, error: null };
    },
    from(table) {
      if (table === 'workspace_meta_connections') {
        const filters = [];
        const query = {
          select() { return query; },
          eq(field, value) { filters.push([field, value]); return query; },
          async in(field, values) {
            const matches = filters.every(([key, value]) => connection[key] === value)
              && values.includes(connection[field]);
            return { data: matches ? [connection] : [], error: null };
          },
        };
        return query;
      }
      assert.equal(table, 'instagram_direct_keyword_deliveries');
      return {
        insert(row) {
          return { select() { return { async maybeSingle() {
            if (insertError) return { data: null, error: insertError };
            const key = row.account_id + ':' + row.message_id;
            if (receipts.has(key)) return { data: null, error: { code: '23505' } };
            receipts.set(key, { ...row });
            return { data: { message_id: row.message_id }, error: null };
          } }; } };
        },
        update(changes) {
          const filter = {};
          const query = {
            eq(field, value) { filter[field] = value; return query; },
            then(resolve) {
              const key = filter.account_id + ':' + filter.message_id;
              if (receipts.has(key)) Object.assign(receipts.get(key), changes);
              return Promise.resolve({ error: null }).then(resolve);
            },
          };
          return query;
        },
      };
    },
  };
}

async function withFetch(handler, callback) {
  const saved = globalThis.fetch;
  globalThis.fetch = handler;
  try { return await callback(); } finally { globalThis.fetch = saved; }
}

test('confirmed Meta message is recorded as sent for the Vital account', async () => {
  const db = fakeDb();
  let calls = 0;
  await withFetch(async (url) => {
    calls++;
    assert.match(url, /^https:\/\/graph\.instagram\.com\//);
    return Response.json({ message_id: 'meta-message-123' });
  }, async () => assert.equal(await processVitalInstagramDirect(message(), db), 1));
  assert.equal(calls, 1);
  assert.equal(db.receipts.get(vital + ':incoming-message-1').status, 'sent');
  assert.equal(db.receipts.get(vital + ':incoming-message-1').flow_id, 'vital-direct-welcome-v1');
  assert.equal(db.rpcCalls[0].args.p_connection_id, 'vital-connection');
});

test('disabled Vital and all Gui messages never reach Meta', async () => {
  for (const [account, db] of [
    [vital, fakeDb({ enabled: false })],
    [vital, fakeDb({ username: 'other-account' })],
    [gui, fakeDb()],
  ]) {
    let calls = 0;
    await withFetch(async () => { calls++; throw new Error('unexpected'); }, async () => {
      assert.equal(await processVitalInstagramDirect(message(account), db), 0);
    });
    assert.equal(calls, 0);
    assert.equal(db.receipts.size, 0);
  }
});

test('a successful HTTP status without a Meta message ID is not counted or retried', async () => {
  const db = fakeDb();
  let calls = 0;
  await withFetch(async () => { calls++; return Response.json({}); }, async () => {
    assert.equal(await processVitalInstagramDirect(message(), db), 0);
  });
  assert.equal(calls, 1);
  assert.equal(db.receipts.get(vital + ':incoming-message-1').status, 'failed');
});

test('a timeout has an uncertain outcome and does not trigger a second send', async () => {
  const db = fakeDb();
  let calls = 0;
  await withFetch(async () => { calls++; throw new Error('timeout'); }, async () => {
    assert.equal(await processVitalInstagramDirect(message(), db), 0);
  });
  assert.equal(calls, 1);
  assert.equal(db.receipts.get(vital + ':incoming-message-1').status, 'failed');
});

test('only an explicit client rejection falls back from template to text', async () => {
  const db = fakeDb();
  let calls = 0;
  await withFetch(async () => {
    calls++;
    return calls === 1
      ? Response.json({ error: { code: 100 } }, { status: 400 })
      : Response.json({ message_id: 'meta-text-123' });
  }, async () => assert.equal(await processVitalInstagramDirect(message(), db), 1));
  assert.equal(calls, 2);
  assert.equal(db.receipts.get(vital + ':incoming-message-1').status, 'sent');
});

test('a duplicate incoming webhook is not sent twice', async () => {
  const db = fakeDb();
  let calls = 0;
  await withFetch(async () => {
    calls++;
    return Response.json({ message_id: 'meta-message-123' });
  }, async () => {
    assert.equal(await processVitalInstagramDirect(message(), db), 1);
    assert.equal(await processVitalInstagramDirect(message(), db), 0);
  });
  assert.equal(calls, 1);
});

test('a database receipt failure stops the send', async () => {
  const db = fakeDb({ insertError: { code: 'unavailable' } });
  let calls = 0;
  await withFetch(async () => { calls++; }, async () => {
    await assert.rejects(processVitalInstagramDirect(message(), db), /could not be recorded/);
  });
  assert.equal(calls, 0);
});
