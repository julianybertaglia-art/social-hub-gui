import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  IG_LOGIN_CALLBACK, directInstagramLoginConfigured,
  instagramBusinessLoginUrl, exactlyVitalInstagram, verifiedVitalInstagramId,
} from '../app/api/vital-connections/instagram/instagram-login/lib.mjs';

const source = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const state = '12345678-1234-4234-8234-123456789abc';

test('Instagram professional login goes to instagram.com, not Facebook or Meta Business', () => {
  const url = new URL(instagramBusinessLoginUrl(state, '123456789012345'));
  assert.equal(url.origin, 'https://www.instagram.com');
  assert.equal(url.pathname, '/oauth/authorize');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('state'), state);
  assert.equal(url.searchParams.get('redirect_uri'), IG_LOGIN_CALLBACK);
  assert.deepEqual(new Set(url.searchParams.get('scope').split(',')),
    new Set(['instagram_business_basic','instagram_business_manage_messages','instagram_business_manage_comments']));
  assert.equal(url.searchParams.has('config_id'), false);
  assert.throws(() => instagramBusinessLoginUrl('abc','123456789012345'));
});

test('Instagram Login validates the exact Vital username and the live numeric ID, never the Facebook-scoped ID', () => {
  assert.equal(exactlyVitalInstagram({user_id:'17841439121395170',username:'vitaldecor_'}),true);
  assert.equal(verifiedVitalInstagramId({user_id:'9999990011223344',username:'vitaldecor_'}),'9999990011223344');
  assert.equal(exactlyVitalInstagram({user_id:'17841401155694295',username:'vitaldecor_'}),false);
  assert.equal(exactlyVitalInstagram({user_id:'9999990011223344',username:'gui_nonato'}),false);
  assert.equal(exactlyVitalInstagram({user_id:'banana',username:'vitaldecor_'}),false);
  assert.equal(exactlyVitalInstagram({id:'17841439121395170',username:'vitaldecor_'}),false);
});

test('Direct Instagram login is disabled until TWO server-only IG-specific credentials exist', () => {
  assert.equal(directInstagramLoginConfigured({}), false);
  assert.equal(directInstagramLoginConfigured({META_VITAL_IG_APP_ID:'123456789012345'}),false);
  assert.equal(directInstagramLoginConfigured({META_VITAL_IG_APP_ID:'123456789012345',META_VITAL_IG_APP_SECRET:'local-test-secret-only'}),true);
  assert.equal(directInstagramLoginConfigured({META_VITAL_IG_APP_ID:'abc',META_VITAL_IG_APP_SECRET:'local-test-secret-only'}),false);
});

test('Only owner can create the one-time direct Instagram login state', () => {
  const start=source('../app/api/vital-connections/instagram/instagram-login/start/route.js');
  assert.match(start, /await authorize\(request\)/);
  assert.match(start,/request.headers.get\('origin'\)/);
  assert.match(start,/directInstagramLoginConfigured\(\)/);
  assert.match(start,/httpOnly: true, secure: true, sameSite: 'lax'/);
});

test('OAuth callback obtains Instagram Graph token and validates account and both subscriptions before replacing only Vital Instagram', () => {
  const code=source('../app/api/vital-connections/instagram/instagram-login/callback/route.js');
  for(const v of [
    'https://api.instagram.com/oauth/access_token',
    'https://graph.instagram.com/access_token',
    'ig_exchange_token',
    'verifiedVitalInstagramId(profile)',
    "subscribed_fields: 'messages,comments'",
    "auth_provider: 'instagram_login'",
    "workspace_id: 'vital-decor'",
    "automatic_replies_enabled: true",
  ])assert.ok(code.includes(v),v);
  assert.ok(code.indexOf('const verifiedIgId = await authorizeDirectAndComments(token);') < code.indexOf('.upsert({'));
  assert.match(code, /external_account_id: verifiedIgId/);
  assert.match(code, /instagramGraph\('me\/subscribed_apps', token/);
  assert.doesNotMatch(code, /external_account_id: VITAL_IG_ID/);
  assert.doesNotMatch(code,/META_WHATSAPP_ACCESS_TOKEN|META_WHATSAPP_APP_SECRET|GUI_INSTAGRAM_ACCESS_TOKEN/);
});

test('Instagram Direct uses Instagram Graph host only for explicitly tagged auth method', () => {
  for(const path of ['../app/api/vital-connections/instagram/direct.mjs','../app/api/vital-connections/instagram/marmore.mjs']){
    const code=source(path);
    assert.match(code,/auth_provider === 'instagram_login'/);
    assert.match(code,/graph.instagram.com/);
    assert.match(code,/graph.facebook.com/);
  }
});

test('Vital-only Instagram Login signing secret cannot validate Gui webhook', () => {
  const code=source('../app/api/instagram/webhook/route.js');
  assert.match(code,/META_VITAL_IG_APP_SECRET/);
  assert.match(code,/\.eq\('auth_provider', 'instagram_login'\)/);
  assert.match(code,/payload.entry.every\(\(entry\) => String\(entry\?\.id \|\| ''\) === accountId\)/);
  assert.match(code,/if \(matches\(legacySecret\)\) return true/);
});
