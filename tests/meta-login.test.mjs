import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchMetaLogin } from '../app/conexoes/vital-decor/meta-login.mjs';

test('Meta receives a normal callback and opens synchronously even with an async handler', async () => {
  let opened = false;
  let callback;
  let result;
  let failure;
  const cancel = launchMetaLogin({ login(fn, options) {
    assert.equal(Object.prototype.toString.call(fn), '[object Function]');
    assert.equal(options.scope, 'instagram_basic');
    callback = fn;
    opened = true;
  } }, { scope: 'instagram_basic' }, async (response) => { result = response; },
  (error) => { failure = error; });
  assert.equal(opened, true);
  const response = { status: 'unknown' };
  callback(response);
  await Promise.resolve();
  assert.equal(result, response);
  assert.equal(failure, undefined);
  cancel();
});

test('SDK errors, missing SDK and unanswered requests release the waiting state', async () => {
  for (const sdk of [null, { login() { throw new Error('SDK error'); } }]) {
    let failure;
    launchMetaLogin(sdk, {}, () => assert.fail('Unexpected result'), (error) => { failure = error; });
    assert.ok(failure instanceof Error);
  }
  await new Promise((resolve) => {
    launchMetaLogin({ login() {} }, {}, () => assert.fail('Unexpected result'), (error) => {
      assert.equal(error.message, 'meta_login_timeout');
      resolve();
    }, 5);
  });
});

test('cancelled and duplicate callbacks cannot prepare another authorization', async () => {
  let callback;
  let calls = 0;
  const sdk = { login(fn) { callback = fn; } };
  const cancel = launchMetaLogin(sdk, {}, async () => { calls++; }, () => assert.fail('Unexpected error'));
  cancel();
  callback({});
  await Promise.resolve();
  assert.equal(calls, 0);
  launchMetaLogin(sdk, {}, async () => { calls++; }, () => assert.fail('Unexpected error'));
  callback({});
  callback({});
  await Promise.resolve();
  assert.equal(calls, 1);
});
