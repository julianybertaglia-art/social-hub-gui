import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseVitalInstagram } from '../app/api/vital-connections/instagram/connection-diagnostic.mjs';

const connection = {
  workspace_id: 'vital-decor', platform: 'instagram', state: 'connected',
  username: 'vitaldecor_', external_account_id: '17841439121395170',
  page_id: '123456789012345', access_token: 'secret-token-only-for-tests',
  auth_provider: 'facebook', automatic_replies_enabled: false,
};
const appId = '1975149819862842';
const identity = { id: connection.external_account_id, username: 'vitaldecor_' };
function sequence(responses, calls) {
  return async (url, options) => {
    calls.push({ url: String(url), options });
    const [value, status = 200] = responses.shift();
    return Response.json(value, { status });
  };
}

test('the existing Facebook connection is checked using read-only requests and its own app', async () => {
  const calls = [];
  const result = await diagnoseVitalInstagram(connection, {
    facebookAppId: appId, facebookApiVersion: 'v25.0',
    fetchImpl: sequence([[identity], [{ data: [
      { id: '1111111111', subscribed_fields: ['messages'] },
      { id: appId, subscribed_fields: ['comments'] },
    ] }]], calls),
  });
  assert.deepEqual(result, {
    profile: { status: 'ok', code: null, subcode: null },
    subscription: { status: 'ok', code: null, subcode: null, messages: false, comments: true },
    automaticReplies: false,
  });
  assert.match(calls[0].url, /^https:\/\/graph\.facebook\.com\/v25\.0\/17841439121395170\?/);
  assert.match(calls[1].url, /^https:\/\/graph\.facebook\.com\/v25\.0\/123456789012345\/subscribed_apps\?/);
  for (const call of calls) {
    assert.ok(!call.options.method || call.options.method === 'GET');
    assert.equal(call.options.headers.Authorization, 'Bearer ' + connection.access_token);
    assert.ok(!call.url.includes(connection.access_token));
  }
  assert.ok(!JSON.stringify(result).includes(connection.access_token));
});

test('a wrong, non-Vital or Gui account is rejected before any network request', async () => {
  let called = false;
  for (const change of [
    { username: 'gui_nonato' }, { external_account_id: '17841401155694295' },
    { workspace_id: 'gui' }, { page_id: '../page' }, { auth_provider: 'unknown' },
  ]) {
    const result = await diagnoseVitalInstagram({ ...connection, ...change }, {
      fetchImpl: async () => { called = true; }, facebookAppId: appId,
    });
    assert.equal(result.profile.status, 'connection_invalid');
  }
  assert.equal(called, false);
});

test('a profile mismatch stops before checking subscriptions', async () => {
  const calls = [];
  const result = await diagnoseVitalInstagram(connection, {
    facebookAppId: appId,
    fetchImpl: sequence([[{ ...identity, username: 'other' }]], calls),
  });
  assert.equal(result.profile.status, 'identity_mismatch');
  assert.equal(result.subscription.status, 'not_checked');
  assert.equal(calls.length, 1);
});

test('only numeric Meta error codes leave the server on a subscription failure', async () => {
  const calls = [];
  const result = await diagnoseVitalInstagram(connection, {
    facebookAppId: appId,
    fetchImpl: sequence([[identity], [{ error: {
      code: 200, error_subcode: 12345, message: 'private details and secret-token-only-for-tests',
    } }, 403]], calls),
  });
  assert.equal(result.profile.status, 'ok');
  assert.deepEqual(result.subscription, { status: 'error', code: 200, subcode: 12345, messages: null, comments: null });
  assert.ok(!JSON.stringify(result).includes('secret-token-only-for-tests'));
  assert.ok(!JSON.stringify(result).includes('private details'));
});

test('missing and unidentifiable app data are reported separately', async () => {
  for (const [data, status] of [[[], 'app_not_listed'], [[{ subscribed_fields: ['messages'] }], 'unconfirmed']]) {
    const result = await diagnoseVitalInstagram(connection, {
      facebookAppId: appId, fetchImpl: sequence([[identity], [{ data }]], []),
    });
    assert.equal(result.subscription.status, status);
    assert.equal(result.subscription.messages, null);
  }
});

test('a later results page means an absent app remains unconfirmed', async () => {
  const result = await diagnoseVitalInstagram(connection, {
    facebookAppId: appId,
    fetchImpl: sequence([[identity], [{ data: [], paging: { next: 'https://example.invalid/next' } }]], []),
  });
  assert.equal(result.subscription.status, 'unconfirmed');
});

test('Instagram login uses Instagram Graph and the newly authorized account ID', async () => {
  const calls = [];
  const current = { ...connection, external_account_id: '9999999999999999', page_id: null,
    auth_provider: 'instagram_login', automatic_replies_enabled: true };
  const result = await diagnoseVitalInstagram(current, {
    instagramAppId: '1582497943285591',
    fetchImpl: sequence([[{ user_id: current.external_account_id, username: 'vitaldecor_' }],
      [{ data: [{ id: '1582497943285591', subscribed_fields: ['messages', 'comments'] }] }]], calls),
  });
  assert.match(calls[0].url, /^https:\/\/graph\.instagram\.com\/v26\.0\/me\?/);
  assert.match(calls[1].url, /^https:\/\/graph\.instagram\.com\/v26\.0\/me\/subscribed_apps\?/);
  assert.equal(result.subscription.messages, true);
  assert.equal(result.subscription.comments, true);
  assert.equal(result.automaticReplies, true);
});

test('network errors never disclose exception text or imply a permission error', async () => {
  const result = await diagnoseVitalInstagram(connection, {
    facebookAppId: appId, fetchImpl: async () => { throw new Error('secret-token-only-for-tests'); },
  });
  assert.deepEqual(result.profile, { status: 'error', code: null, subcode: null });
  assert.ok(!JSON.stringify(result).includes(connection.access_token));
});
