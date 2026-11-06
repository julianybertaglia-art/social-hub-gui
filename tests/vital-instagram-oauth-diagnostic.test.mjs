import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Callback saves only a safe, allowlisted OAuth failure reason', () => {
  const code = read('../app/api/vital-connections/instagram/unified/callback/route.js');
  assert.match(code, /const reason = safeAuthError\(error\?\.reason\)/);
  assert.ok(code.includes("candidates: [{ type: 'unified_oauth_failure', reason, metaCode, metaSubcode }]"));
  assert.match(code, /\.eq\('status', 'consuming'\)/);
  assert.doesNotMatch(code, /candidates: \[\{[^\n]*token:/);
});

test('Owner-only status exposes safe diagnostic, not session candidates or credentials', () => {
  const code = read('../app/api/vital-connections/service.js');
  assert.match(code, /\.eq\('owner_user_id', ownerId\)/);
  assert.match(code, /summarizeInstagramAttempt\(latest\)/);
  assert.match(code, /appId: APP_ID, instagramLogin/);
  assert.doesNotMatch(code, /instagramLogin:[^\n]*candidates/);
  const readStatus = code.split('export async function readStatus(')[1];
  assert.doesNotMatch(readStatus, /clearExpiredSessions|\.update\(|\.insert\(|\.delete\(/);
});

test('Vital Instagram UI keeps failure visible after the Meta return tab closes', () => {
  const code = read('../app/VitalInstagramAutomationPanel.js');
  assert.match(code, /lastLogin\?\.status === 'failed'/);
  assert.match(code, /failureExplanations\[lastLogin\.reason\]/);
});

test('Meta token exchange uses code first, then exact redirect only as controlled fallback', () => {
  const callback = read('../app/api/vital-connections/instagram/unified/callback/route.js');
  const exchange = callback.split('async function exchangeCode(code) {')[1].split('async function verifyUnifiedToken(')[0];
  assert.match(exchange, /if \(withRedirect\) url\.searchParams\.set\('redirect_uri', CALLBACK_URL\)/);
  assert.match(exchange, /url\.searchParams\.set\('client_id', UNIFIED_APP_ID\)/);
  assert.match(exchange, /url\.searchParams\.set\('client_secret', credential\.value\)/);
  assert.match(exchange, /url\.searchParams\.set\('code', code\)/);
  assert.match(exchange, /authFailure\('exchange', lastMetaError\)/);
  assert.match(callback, /metaCode: Number\.isInteger/);
  assert.doesNotMatch(callback, /candidates: \[\{[^\n]*access_token/);
});

