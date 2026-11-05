import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CALLBACK_COOKIE, CALLBACK_URL, UNIFIED_APP_ID, UNIFIED_CONFIG_ID,
  VITAL_INSTAGRAM_ID, VITAL_BUSINESS_ID, safeAuthError,
  unifiedLoginUrl, selectVitalInstagram,
} from '../app/api/vital-connections/instagram/unified/lib.mjs';

const state = '11111111-2222-4333-8444-555555555555';
const file = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('The Meta Unified Login config is used without legacy OAuth scopes', () => {
  const url = new URL(unifiedLoginUrl(state));
  assert.equal(url.origin, 'https://www.facebook.com');
  assert.equal(url.searchParams.get('client_id'), UNIFIED_APP_ID);
  assert.equal(url.searchParams.get('config_id'), UNIFIED_CONFIG_ID);
  assert.equal(url.searchParams.get('state'), state);
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('redirect_uri'), CALLBACK_URL);
  assert.equal(url.searchParams.has('scope'), false);
  assert.equal(url.searchParams.get('prompt'), 'login');
  assert.throws(() => unifiedLoginUrl('abc'), /inválido/);
});

test('Unified Login cannot authorize Gui or an unrelated account', () => {
  assert.equal(VITAL_BUSINESS_ID, '1055955574784532');
  assert.equal(VITAL_INSTAGRAM_ID, '17841439121395170');
  assert.deepEqual(selectVitalInstagram({ data: [
    { id: '17841401155694295', username: 'gui_nonato' },
    { id: VITAL_INSTAGRAM_ID, username: 'vitaldecor_' },
  ] }), { id: VITAL_INSTAGRAM_ID, username: 'vitaldecor_' });
  assert.equal(selectVitalInstagram({ data: [
    { id: '17841401155694295', username: 'gui_nonato' },
  ] }), null);
  assert.equal(selectVitalInstagram({ data: [
    { id: VITAL_INSTAGRAM_ID, username: 'another_account' },
  ] }), null);
});

test('Only known error codes appear in the browser redirect', () => {
  assert.equal(safeAuthError('permissions'), 'permissions');
  assert.equal(safeAuthError('secret=private'), 'exchange');
  assert.equal(safeAuthError(undefined), 'exchange');
});

test('Start route is owner verified, origin locked and sets HttpOnly OAuth cookie', () => {
  const code = file('../app/api/vital-connections/instagram/unified/start/route.js');
  assert.match(code, /authorize\(request\)/);
  assert.match(code, /request\.headers\.get\('origin'\)/);
  assert.match(code, /\.eq\('id', state\)|status: 'prepared'/);
  assert.match(code, /httpOnly: true, secure: true, sameSite: 'lax'/);
  assert.match(code, /UNIFIED_CONFIG_ID|unifiedLoginUrl/);
  assert.match(CALLBACK_COOKIE, /vital_ig/);
});

test('Callback validates state, business, Instagram ID and both webhook fields before token replacement', () => {
  const code = file('../app/api/vital-connections/instagram/unified/callback/route.js');
  const sequence = [
    "state !== cookie",
    "status: 'consuming'",
    "const token = await exchangeCode(code);",
    "await verifyUnifiedToken(token);",
    "await subscribeInstagram(token);",
    ".upsert({",
  ].map((needle) => code.indexOf(needle));
  assert.ok(sequence.every((pos) => pos >= 0), 'all verification stages must exist');
  for (let i = 1; i < sequence.length; i++) {
    assert.ok(sequence[i] > sequence[i - 1], 'verification must happen before saving');
  }
  assert.match(code, /VITAL_BUSINESS_ID/);
  assert.match(code, /selectVitalInstagram/);
  assert.match(code, /me\/assigned_instagram_accounts/);
  assert.match(code, /subscribed_fields: 'messages,comments'/);
  assert.match(code, /META_APP_SECRET/);
  assert.doesNotMatch(code, /META_WHATSAPP_APP_SECRET|META_WHATSAPP_ACCESS_TOKEN|NEXT_PUBLIC_META/);
  assert.match(code, /status: 'consumed'/);
  assert.match(code, /response\.cookies\.set\(CALLBACK_COOKIE, ''/);
});

test('Both Vital Instagram UI pages use Unified Login rather than legacy scopes', () => {
  const page = file('../app/conexoes/vital-decor/page.js');
  const panel = file('../app/VitalInstagramAutomationPanel.js');
  assert.match(page, /startVitalInstagramUnifiedLogin\(supabase\)/);
  assert.match(panel, /startVitalInstagramUnifiedLogin\(supabase\)/);
  assert.doesNotMatch(page, /scope: 'instagram_basic,pages_show_list/);
  assert.doesNotMatch(panel, /scope: 'instagram_basic,pages_show_list/);
});

test('Unified-login subscriptions use IG ID when page ID is absent', () => {
  const status = file('../app/api/vital-connections/service.js');
  const direct = file('../app/api/vital-connections/instagram/direct-control/route.js');
  const comments = file('../app/api/vital-connections/instagram/comment-control/route.js');
  assert.match(status, /row\.page_id \|\| row\.external_account_id/);
  assert.match(direct, /existing\.page_id \|\| existing\.external_account_id/);
  assert.match(comments, /connection\.page_id \|\| connection\.external_account_id/);
});
