import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Callback saves only a safe, allowlisted OAuth failure reason', () => {
  const code = read('../app/api/vital-connections/instagram/unified/callback/route.js');
  assert.match(code, /const reason = safeAuthError\(error\?\.reason\)/);
  assert.match(code, /candidates: \[\{ type: 'unified_oauth_failure', reason \}\]/);
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
