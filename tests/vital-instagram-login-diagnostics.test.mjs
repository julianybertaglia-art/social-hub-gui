import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeInstagramAttempt } from '../app/api/vital-connections/instagram/login-diagnostics.mjs';

const now = Date.parse('2026-11-06T04:00:00Z');
const attempt = (kind, reason) => ({
  status: 'expired',
  created_at: '2026-11-05T20:06:42Z',
  candidates: [{ type: kind, reason }],
});

test('the latest native Instagram failure remains visible after returning to the panel', () => {
  const summary = summarizeInstagramAttempt(attempt('instagram_oauth_failure', 'wrong_account'), now);
  assert.deepEqual(summary, {
    status: 'failed', reason: 'wrong_account', metaCode: null,
    metaSubcode: null, checkedAt: '2026-11-05T20:06:42Z',
  });
  assert.equal(summarizeInstagramAttempt(attempt('instagram_oauth_failure', 'wrong_username'), now).reason, 'wrong_username');
});

test('Unified Login failures expose only known reasons and bounded numeric codes', () => {
  const entry = attempt('unified_oauth_failure', 'account_not_shared');
  entry.candidates[0].metaCode = 190;
  entry.candidates[0].metaSubcode = 12345;
  assert.equal(summarizeInstagramAttempt(entry, now).reason, 'account_not_shared');
  assert.equal(summarizeInstagramAttempt(entry, now).metaCode, 190);
  entry.candidates[0].reason = 'untrusted credential text';
  entry.candidates[0].metaCode = '190';
  assert.equal(summarizeInstagramAttempt(entry, now).reason, null);
  assert.equal(summarizeInstagramAttempt(entry, now).metaCode, null);
  assert.doesNotMatch(JSON.stringify(summarizeInstagramAttempt(entry, now)), /credential text/);
});

test('a stale unfinished session is reported expired without mutating it', () => {
  const entry = { status: 'prepared', expires_at: '2026-11-06T03:00:00Z', created_at: '2026-11-06T02:52:00Z' };
  const before = structuredClone(entry);
  assert.equal(summarizeInstagramAttempt(entry, now).reason, 'expired');
  assert.equal(summarizeInstagramAttempt(entry, now).status, 'failed');
  assert.deepEqual(entry, before);
});

test('current pending and consumed sessions retain their distinct states', () => {
  assert.equal(summarizeInstagramAttempt({ status: 'consuming', expires_at: '2026-11-06T05:00:00Z' }, now).status, 'pending');
  assert.equal(summarizeInstagramAttempt({ status: 'consumed' }, now).status, 'confirmed');
  assert.equal(summarizeInstagramAttempt(null, now).status, 'pending');
});
