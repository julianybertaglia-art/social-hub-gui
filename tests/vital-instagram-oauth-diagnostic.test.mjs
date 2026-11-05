import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Callback saves only a safe, allowlisted OAuth failure reason', () => {
  const code = read('../app/api/vital-connections/instagram/unified/callback/route.js');
  assert.match(code, /const reason = safeAuthError\(error\?\.reason\)/);
  assert.match(code, /candidates: \\[\\{ type: 'unified_oauth_failure', reason, metaCode, metaSubcode \\}\\]/);
  assert.match(code, /\.eq\('status', 'consuming'\)/);
  assert.doesNotMatch(code, /candidates: \[\{[^\n]*token:/);
});

test('Owner-only status exposes safe diagnostic, not session candidates or credentials', () => {
  const code = read('../app/api/vital-connections/service.js');
  assert.match(code, /\.eq\('owner_user_id', ownerId\)/);
  assert.match(code, /validFailureReasons\.has\(rawReason\)/);
  assert.match(code, /appId: APP_ID, instagramLogin/);
  assert.doesNotMatch(code, /instagramLogin:[^\n]*candidates/);
});

test('Vital Instagram UI keeps failure visible after the Meta return tab closes', () => {
  const code = read('../app/VitalInstagramAutomationPanel.js');
  assert.match(code, /lastLogin\?\.status === 'failed'/);
  assert.match(code, /failureExplanations\[lastLogin\.reason\]/);
});

test('Meta token exchange omits the browser-only redirect URI and only retains numeric error identifiers', () => {
  const callback = read('../app/api/vital-connections/instagram/unified/callback/route.js');
  const exchange = callback.split('async function exchangeCode(code) {')[1].split('async function verifyUnifiedToken(')[0];
  assert.doesNotMatch(exchange, /url\.searchParams\.set\('redirect_uri'/);
  assert.match(exchange, /url\.searchParams\.set\('client_id', UNIFIED_APP_ID\)/);
  assert.match(exchange, /url\.searchParams\.set\('client_secret', secret\)/);
  assert.match(exchange, /url\.searchParams\.set\('code', code\)/);
  assert.match(exchange, /authFailure\('exchange', result\?\.error\)/);
  assert.match(callback, /metaCode: Number\.isInteger/);
  assert.doesNotMatch(callback, /candidates: \[\{[^\n]*access_token/);
});
