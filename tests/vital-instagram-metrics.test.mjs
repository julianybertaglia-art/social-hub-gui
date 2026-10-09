import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectedInstagram, instagramMetrics, insightTotal, numericMetric, thirtyDayRange }
  from '../app/api/vital-connections/instagram/metrics.mjs';

const connection = { owner_user_id: 'owner', workspace_id: 'vital-decor', platform: 'instagram',
  state: 'connected', external_account_id: '17841439121395170', username: 'vitaldecor_', access_token: 'private-vital-token' };
const now = new Date('2026-10-09T11:20:52Z');
const profile = { id: connection.external_account_id, username: 'vitaldecor_', name: 'Vital Decor',
  followers_count: 23456, media_count: 120 };

test('a real zero is distinct from unavailable or invalid metrics; daily reach is never added', () => {
  assert.equal(numericMetric(0), 0);
  assert.equal(numericMetric('123'), 123);
  for (const value of [null, undefined, '', NaN, Infinity, -1, false, 'missing']) assert.equal(numericMetric(value), null);
  assert.equal(insightTotal({ total_value: { value: 0 } }), 0);
  assert.equal(insightTotal({ values: [{ value: 80 }, { value: 80 }] }), null);
});

test('the date range covers thirty complete days in Brazil, including before UTC midnight catches up', () => {
  const range = thirtyDayRange(now);
  assert.equal(range.startDate, '2026-09-09');
  assert.equal(range.endDate, '2026-10-08');
  assert.equal(range.until - range.since, 30 * 86400);
  assert.equal(new Date(range.until * 1000).toISOString(), '2026-10-09T03:00:00.000Z');
  assert.equal(thirtyDayRange(new Date('2026-10-09T01:00:00Z')).endDate, '2026-10-07');
});

test('a metrics request reads only the authorized Vital account and returns public data without credentials', async () => {
  const calls = [];
  const graph = async (path, token, options) => {
    calls.push({ path, token, query: options.query });
    if (path.endsWith('/insights')) return { data: [
      { name: 'reach', total_value: { value: 1000 } }, { name: 'views', total_value: { value: 0 } },
      { name: 'total_interactions', total_value: { value: 32 } },
    ] };
    return profile;
  };
  const result = await instagramMetrics(connection, graph, now);
  assert.deepEqual(result.metrics, { seguidores: 23456, alcance: 1000, visualizacoes: 0, interacoes: 32 });
  assert.equal(result.profile.username, 'vitaldecor_');
  assert.equal(result.updatedAt, now.toISOString());
  assert.doesNotMatch(JSON.stringify(result), /private-vital-token|access_token|accessToken|owner_user_id/);
  for (const call of calls) {
    assert.ok(call.path.startsWith(connection.external_account_id));
    assert.equal(call.token, connection.access_token);
  }
  assert.equal(calls.find(call => call.path.endsWith('/insights')).query.metric_type, 'total_value');
});

test('one unavailable insight does not replace other metrics with zero or another brand data', async () => {
  const result = await instagramMetrics(connection, async (path, token, { query }) => {
    if (!path.endsWith('/insights')) return profile;
    if (query.metric.includes(',') || query.metric === 'views') throw new Error('unsupported');
    return { data: [{ name: query.metric, total_value: { value: query.metric === 'reach' ? 50 : 7 } }] };
  }, now);
  assert.deepEqual(result.metrics, { seguidores: 23456, alcance: 50, visualizacoes: null, interacoes: 7 });
  assert.deepEqual(result.unavailableMetrics, ['visualizacoes']);
});

test('Gui credentials, disconnected accounts and a mismatched Meta profile are rejected', async () => {
  for (const row of [{ ...connection, external_account_id: '17841401155694295' },
    { ...connection, workspace_id: 'gui-nonato' }, { ...connection, state: 'pending' }, { ...connection, access_token: '' }]) {
    await assert.rejects(instagramMetrics(row, async () => { throw new Error('must not query'); }, now), { status: 409 });
  }
  await assert.rejects(instagramMetrics(connection, async path => path.endsWith('/insights')
    ? { data: [] } : { ...profile, id: '17841401155694295' }, now), { status: 502 });
});

test('workspace credentials must belong to the authenticated owner', async () => {
  let row = connection;
  const filters = [];
  const db = { from(table) {
    assert.equal(table, 'workspace_meta_connections');
    const q = { select() { return q; }, eq(key, value) { filters.push([key, value]); return q; },
      async maybeSingle() { return { data: row }; } };
    return q;
  } };
  assert.equal(await connectedInstagram(db, 'owner'), connection);
  assert.deepEqual(filters, [['owner_user_id', 'owner'], ['workspace_id', 'vital-decor'], ['platform', 'instagram']]);
  row = { ...connection, owner_user_id: 'other-owner' };
  await assert.rejects(connectedInstagram(db, 'owner'), { status: 409 });
  row = null;
  await assert.rejects(connectedInstagram(db, 'owner'), { status: 409 });
});
