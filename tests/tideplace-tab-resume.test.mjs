import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasAuthIdentityChanged, sameAuthenticatedUser } from '../app/lib/session-gate.mjs';

const session = (id, token) => ({ user: { id }, access_token: token });

test('renewing a token for the same user does not reset the dashboard', () => {
  assert.equal(sameAuthenticatedUser(session('ju', 'old'), session('ju', 'new')), true);
  assert.equal(hasAuthIdentityChanged('ju', session('ju', 'new')), false);
});

test('a sign-out or account switch still requires session initialization', () => {
  assert.equal(sameAuthenticatedUser(session('ju', 'old'), null), false);
  assert.equal(hasAuthIdentityChanged('ju', null), true);
  assert.equal(hasAuthIdentityChanged('ju', session('another', 'new')), true);
  assert.equal(hasAuthIdentityChanged(null, session('ju', 'new')), true);
  assert.equal(hasAuthIdentityChanged(null, null), false);
});

test('background Instagram refresh updates the UI without reloading the page', () => {
  const gate = readFileSync(new URL('../app/CloudGate.js', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../app/page.js', import.meta.url), 'utf8');
  assert.doesNotMatch(gate, /window\.location\.reload\s*\(/);
  assert.match(gate, /dispatchEvent\(new CustomEvent\('tideplace:instagram-metrics-updated'/);
  assert.match(home, /addEventListener\('tideplace:instagram-metrics-updated'/);
  assert.match(gate, /\}, \[session\?\.user\?\.id\]\)/);
});
