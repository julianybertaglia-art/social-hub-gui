import test from 'node:test';
import assert from 'node:assert/strict';
import { checkoutRecoveryPlan, recoveryMessage, recoveryPlan, recoveryUrl } from '../app/lib/server/vital-payment-recovery.mjs';

const now = Date.parse('2026-11-26T23:00:00Z');
const order = {
  id: '123', number: 130, status: 'open', payment_status: 'pending',
  created_at: '2026-11-26T22:00:00Z', contact_name: 'Ana',
};
test('payment email is due after 30 minutes and WhatsApp after 210 minutes', () => {
  const stages = recoveryPlan(order, now);
  assert.equal(stages[0].due, true);
  assert.equal(stages[1].due, false);
  assert.equal(stages[1].dueAt, '2026-11-27T01:30:00.000Z');
});
test('paid, cancelled, expired, invalid and old orders are never eligible', () => {
  for (const patch of [
    { payment_status: 'paid' }, { payment_status: 'expired' }, { status: 'cancelled' },
    { id: 'x' }, { created_at: 'bad' }, { created_at: '2026-11-25T22:00:00Z' },
  ]) assert.deepEqual(recoveryPlan({ ...order, ...patch }, now), []);
});
test('checkout email waits six hours from recorded creation and expires from the API window', () => {
  const checkout = { id: '456', created_at: '2026-11-26T16:00:00Z' };
  assert.equal(checkoutRecoveryPlan(checkout, now)[0].due, true);
  assert.equal(checkoutRecoveryPlan({ ...checkout, completed_at: '2026-11-26T17:00:00Z' }, now).length, 0);
  assert.equal(checkoutRecoveryPlan({ ...checkout, created_at: '2026-10-25T00:00:00Z' }, now).length, 0);
});
test('email content personalizes safely and uses only an official HTTPS link', () => {
  const message = recoveryMessage({ ...order, contact_name: '<Ana>', checkout_url: 'https://evil.example/path' }, 'payment');
  assert.match(message.subject, /Vital|pedido/i);
  assert.match(message.html, /&lt;Ana&gt;/);
  assert.match(message.html, /https:\/\/www\.vitaldecor\.com\.br/);
  assert.doesNotMatch(message.html, /evil\.example/);
  assert.match(message.text, /#130/);
});
test('checkout links allow official Nuvemshop domains only', () => {
  assert.match(recoveryUrl({ abandoned_checkout_url: 'https://vital.lojavirtualnuvem.com.br/checkout/abc' }, 'checkout'), /lojavirtualnuvem\.com\.br/);
  assert.equal(recoveryUrl({ abandoned_checkout_url: 'http://vitaldecor.com.br/checkout' }, 'checkout'), '');
});
