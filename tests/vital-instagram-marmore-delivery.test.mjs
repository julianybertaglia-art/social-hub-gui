import test from 'node:test';
import assert from 'node:assert/strict';
import { MARMORE_REPLY_TEXT, processVitalMarmoreComments, processVitalJardimComments, processVitalBikeComments } from '../app/api/vital-connections/instagram/marmore.mjs';
import { JARDIM_REPLY_TEXT } from '../app/lib/vital-jardim-copy.mjs';
import { BIKE_REPLY_TEXT, BIKE_PUBLIC_REPLY } from '../app/lib/vital-bike-copy.mjs';

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

function fakeDb({ username = 'vitaldecor_', persistReceipt = true, authProvider = 'instagram_login' } = {}) {
  const events = [];
  const deliveries = new Map();
  const connection = {
    id: 'vital-connection',
    workspace_id: 'vital-decor', platform: 'instagram', state: 'connected',
    external_account_id: vital, username, access_token: 'test-token',
    auth_provider: authProvider,
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
    if (calls === 1) {
      assert.equal(JSON.parse(options.body).recipient.comment_id, '1799999000111222');
      assert.equal(JSON.parse(options.body).message.text, MARMORE_REPLY_TEXT);
      return Response.json({ message_id: 'meta-private-message-123' });
    }
    assert.match(url, /\/1799999000111222\/replies$/);
    assert.equal(JSON.parse(options.body).message, 'Te enviei o link no Direct! 💜');
    return Response.json({ id: 'meta-public-reply-123' });
  }, async () => assert.equal(await processVitalMarmoreComments(incoming(), db), 1));
  assert.equal(calls, 2);
  assert.equal(db.events[0].matched_rule_id, 'vital-marmore-comment-link-v1');
  assert.equal(db.events[0].private_status, 'sent');
  assert.equal(db.events[0].public_status, 'sent');
  assert.equal(db.events[0].public_reply_id, 'meta-public-reply-123');
  assert.equal(db.deliveries.get('1799999000111222').workspace_id, 'vital-decor');
  assert.equal(db.deliveries.get('1799999000111222').account_id, vital);
  assert.equal(db.deliveries.get('1799999000111222').connection_id, 'vital-connection');
  assert.equal(db.deliveries.get('1799999000111222').meta_message_id, 'meta-private-message-123');
});

test('a 200 response without a Meta message ID is recorded as failed', async () => {
  const db = fakeDb();
  let calls = 0;
  await withFetch(async () => { calls++; return Response.json({}); }, async () => {
    assert.equal(await processVitalMarmoreComments(incoming(), db), 0);
  });
  assert.equal(calls, 1);
  assert.equal(db.events[0].private_status, 'failed');
  assert.equal(db.events[0].public_status, 'skipped');
  assert.equal(db.deliveries.get('1799999000111222').status, 'failed');
});

test('a matching JARDIM comment receives the garden link privately and a public reply only once', async () => {
  const db = fakeDb();
  let calls = 0;
  await withFetch(async (url, options) => {
    calls++;
    assert.match(url, /^https:\/\/graph\.instagram\.com\//);
    const body = JSON.parse(options.body);
    if (calls === 1) {
      assert.equal(body.recipient.comment_id, '1799999000111222');
      assert.equal(body.message.text, JARDIM_REPLY_TEXT);
      return Response.json({ message_id: 'garden-private-123' });
    }
    assert.match(url, /\/1799999000111222\/replies$/);
    assert.equal(body.message, 'Te enviei o link no Direct! 💜');
    return Response.json({ id: 'garden-public-123' });
  }, async () => {
    assert.equal(await processVitalJardimComments(incoming(vital, 'JARDIM'), db), 1);
    assert.equal(await processVitalJardimComments(incoming(vital, 'JARDIM'), db), 0);
  });
  assert.equal(calls, 2);
  assert.equal(db.events[0].matched_rule_id, 'vital-jardim-comment-link-v1');
  assert.equal(db.events[0].matched_keyword, 'JARDIM');
  assert.equal(db.events[0].private_status, 'sent');
  assert.equal(db.events[0].public_status, 'sent');
});

test('a mixed keyword comment sends just the existing marble response', async () => {
  const db = fakeDb();
  let calls = 0;
  await withFetch(async (_url, options) => {
    calls++;
    if (calls === 1) {
      assert.equal(JSON.parse(options.body).message.text, MARMORE_REPLY_TEXT);
      return Response.json({ message_id: 'mixed-private-123' });
    }
    return Response.json({ id: 'mixed-public-123' });
  }, async () => {
    const mixed = incoming(vital, 'Quero jardim e mármore');
    const results = await Promise.all([processVitalMarmoreComments(mixed, db), processVitalJardimComments(mixed, db)]);
    assert.deepEqual(results, [1, 0]);
  });
  assert.equal(calls, 2);
  assert.equal(db.events.length, 1);
});

test('JARDIM never sends to Gui or another Instagram account', async () => {
  for (const [account, db] of [[gui, fakeDb()], [vital, fakeDb({ username: 'other-account' })]]) {
    let calls = 0;
    await withFetch(async () => { calls++; }, async () => {
      assert.equal(await processVitalJardimComments(incoming(account, 'JARDIM'), db), 0);
    });
    assert.equal(calls, 0);
  }
});

test('a Facebook-authenticated Vital connection sends both replies using Facebook Graph', async () => {
  const db = fakeDb({ authProvider: 'facebook' });
  let calls = 0;
  await withFetch(async (url) => {
    calls++;
    assert.match(url, /^https:\/\/graph\.facebook\.com\//);
    return Response.json(calls === 1 ? { message_id: 'meta-private-message-123' } : { id: 'meta-public-reply-123' });
  }, async () => assert.equal(await processVitalMarmoreComments(incoming(), db), 1));
  assert.equal(calls, 2);
  assert.equal(db.events[0].public_status, 'sent');
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
    return Response.json(calls === 1 ? { message_id: 'meta-private-message-123' } : { id: 'meta-public-reply-123' });
  }, async () => {
    assert.equal(await processVitalMarmoreComments(incoming(), db), 1);
    assert.equal(await processVitalMarmoreComments(incoming(), db), 0);
  });
  assert.equal(calls, 2);
});

test('concurrent copies of the same comment are claimed only once', async () => {
  const db = fakeDb();
  let calls = 0;
  await withFetch(async () => {
    calls++;
    return Response.json(calls === 1 ? { message_id: 'meta-private-message-123' } : { id: 'meta-public-reply-123' });
  }, async () => {
    const results = await Promise.all([
      processVitalMarmoreComments(incoming(), db),
      processVitalMarmoreComments(incoming(), db),
    ]);
    assert.equal(results.reduce((a, b) => a + b, 0), 1);
  });
  assert.equal(calls, 2);
  assert.equal(db.events.length, 1);
  assert.equal(db.deliveries.size, 1);
});

test('a rejected public reply does not erase a confirmed private reply', async () => {
  const db = fakeDb();
  let calls = 0;
  await withFetch(async () => {
    calls++;
    return calls === 1 ? Response.json({ message_id: 'meta-private-message-123' })
      : Response.json({ error: { code: 200 } }, { status: 403 });
  }, async () => assert.equal(await processVitalMarmoreComments(incoming(), db), 1));
  assert.equal(db.events[0].private_status, 'sent');
  assert.equal(db.events[0].public_status, 'failed');
  assert.equal(db.deliveries.get('1799999000111222').status, 'sent');
});

test('an unconfirmed public reply is not replayed on a duplicate webhook', async () => {
  const db = fakeDb();
  let calls = 0;
  await withFetch(async () => {
    calls++;
    return Response.json(calls === 1 ? { message_id: 'meta-private-message-123' } : {});
  }, async () => {
    assert.equal(await processVitalMarmoreComments(incoming(), db), 1);
    assert.equal(await processVitalMarmoreComments(incoming(), db), 0);
  });
  assert.equal(calls, 2);
  assert.equal(db.events[0].public_status, 'unverified');
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



test('BIKE sends the product URL privately and the public reply only after confirmed delivery', async () => {
  const db = fakeDb();
  let calls = 0;
  await withFetch(async (url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    if (calls === 1) {
      assert.match(url, /graph.instagram.com/);
      assert.equal(body.recipient.comment_id, '1799999000111222');
      assert.equal(body.message.text, BIKE_REPLY_TEXT);
      return Response.json({ message_id: 'bike-private-123' });
    }
    assert.equal(body.message, BIKE_PUBLIC_REPLY);
    return Response.json({ id: 'bike-public-123' });
  }, async () => {
    assert.equal(await processVitalBikeComments(incoming(vital, 'BIKE'), db), 1);
    assert.equal(await processVitalBikeComments(incoming(vital, 'BIKE'), db), 0);
  });
  assert.equal(calls, 2);
  assert.equal(db.events[0].matched_rule_id, 'vital-bike-comment-link-v1');
  assert.equal(db.events[0].private_status, 'sent');
  assert.equal(db.events[0].public_status, 'sent');
});
test('BIKE does not send to Gui Instagram or an incorrectly named Vital connection', async () => {
  for (const [account, db] of [[gui, fakeDb()], [vital, fakeDb({ username: 'another-account' })]]) {
    let calls = 0;
    await withFetch(async () => { calls++; }, async () => {
      assert.equal(await processVitalBikeComments(incoming(account, 'BIKE'), db), 0);
    });
    assert.equal(calls, 0);
  }
});
