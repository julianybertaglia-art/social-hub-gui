import test from 'node:test';
import assert from 'node:assert/strict';
import { processVitalMarmoreComments } from '../app/api/vital-connections/instagram/marmore.mjs';

const vital = '17841439121395170';
const gui = '17841401155694295';
const incoming = (account = vital, text = 'MÁRMORE') => ({
  object: 'instagram', entry: [{
    id: account,
    changes: [{ field: 'comments', value: {
      id: '1799999000111222', text, from: { username: 'cliente-teste' },
    } }],
  }],
});

function fakeDb({ username = 'vitaldecor_', persistReceipt = true } = {}) {
  const events = [];
  const deliveries = new Map();
  const connection = {
    id: 'vital-connection',
    workspace_id: 'vital-decor', platform: 'instagram', state: 'connected',
    external_account_id: vital, username, access_token: 'test-token',
    auth_provider: 'instagram_login',
  };
  return {
    events,
    deliveries,
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
      if (table === 'vital_instagram_comment_deliveries') return {
        insert(row) {
          return { select() { return { async maybeSingle() {
            if (deliveries.has(row.comment_id)) return { data: null, error: { code: '23505' } };
            deliveries.set(row.comment_id, { ...row });
            return { data: { comment_id: row.comment_id }, error: null };
          } }; } };
        },
        update(values) {
          const filters = {};
          const query = {
            eq(field, value) { filters[field] = value; return query; },
            select() { return query; },
            async maybeSingle() {
              const row = deliveries.get(filters.comment_id);
              if (!persistReceipt || !row || !Object.entries(filters).every(([key, value]) => row[key] === value)) {
                return { data: null, error: { code: 'unavailable' } };
              }
              Object.assign(row, values);
              return { data: { comment_id: row.comment_id }, error: null };
            },
          };
          return query;
        },
      };
      assert.equal(table, 'instagram_automation_events');
      return {
        select() {
          const filters = [];
          const query = {
            eq(field, value) { filters.push([field, value]); return query; },
            limit() { return query; },
            async maybeSingle() {
              return { data: events.find(event =>
                filters.every(([key, value]) => event[key] === value)) || null, error: null };
            },
          };
          return query;
        },
        insert(row) {
          return { select() { return { async single() {
            const event = { ...row, id: events.length + 1 };
            events.push(event);
            return { data: { id: event.id }, error: null };
          } }; } };
        },
        update(changes) {
          return { async eq(field, value) {
            const event = events.find(item => item[field] === value);
            if (event) Object.assign(event, changes);
            return { error: null };
          } };
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

test('a matching Vital comment receives a confirmed private reply', async () => {
  const db = fakeDb();
  let calls = 0;
  await withFetch(async (url, options) => {
    calls++;
    assert.match(url, /^https:\/\/graph\.instagram\.com\//);
    assert.equal(JSON.parse(options.body).recipient.comment_id, '1799999000111222');
    return Response.json({ message_id: 'meta-private-message-123' });
  }, async () => assert.equal(await processVitalMarmoreComments(incoming(), db), 1));
  assert.equal(calls, 1);
  assert.equal(db.events[0].matched_rule_id, 'vital-marmore-comment-link-v1');
  assert.equal(db.events[0].private_status, 'sent');
  assert.equal(db.deliveries.get('1799999000111222').workspace_id, 'vital-decor');
  assert.equal(db.deliveries.get('1799999000111222').account_id, vital);
  assert.equal(db.deliveries.get('1799999000111222').connection_id, 'vital-connection');
  assert.equal(db.deliveries.get('1799999000111222').meta_message_id, 'meta-private-message-123');
});

test('a 200 response without a Meta message ID is recorded as failed', async () => {
  const db = fakeDb();
  await withFetch(async () => Response.json({}), async () => {
    assert.equal(await processVitalMarmoreComments(incoming(), db), 0);
  });
  assert.equal(db.events[0].private_status, 'failed');
  assert.equal(db.deliveries.get('1799999000111222').status, 'failed');
});

test('other accounts and the Gui never trigger the Vital comment rule', async () => {
  for (const [account, db] of [[gui, fakeDb()], [vital, fakeDb({ username: 'other-account' })]]) {
    let calls = 0;
    await withFetch(async () => { calls++; }, async () => {
      assert.equal(await processVitalMarmoreComments(incoming(account), db), 0);
    });
    assert.equal(calls, 0);
    assert.equal(db.events.length, 0);
  }
});

test('a previously processed comment is not replayed in a later webhook', async () => {
  const db = fakeDb();
  let calls = 0;
  await withFetch(async () => {
    calls++;
    return Response.json({ message_id: 'meta-private-message-123' });
  }, async () => {
    assert.equal(await processVitalMarmoreComments(incoming(), db), 1);
    assert.equal(await processVitalMarmoreComments(incoming(), db), 0);
  });
  assert.equal(calls, 1);
});

test('concurrent copies of the same comment are claimed only once', async () => {
  const db = fakeDb();
  let calls = 0;
  await withFetch(async () => {
    calls++;
    return Response.json({ message_id: 'meta-private-message-123' });
  }, async () => {
    const results = await Promise.all([
      processVitalMarmoreComments(incoming(), db),
      processVitalMarmoreComments(incoming(), db),
    ]);
    assert.equal(results.reduce((a, b) => a + b, 0), 1);
  });
  assert.equal(calls, 1);
  assert.equal(db.events.length, 1);
  assert.equal(db.deliveries.size, 1);
});

test('a confirmed response is unverified when the durable receipt cannot be saved', async () => {
  const db = fakeDb({ persistReceipt: false });
  let calls = 0;
  await withFetch(async () => {
    calls++;
    return Response.json({ message_id: 'meta-private-message-123' });
  }, async () => assert.equal(await processVitalMarmoreComments(incoming(), db), 0));
  assert.equal(calls, 1);
  assert.equal(db.events[0].private_status, 'unverified');
});
