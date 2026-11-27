import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchRecoveryEmail } from '../app/lib/server/vital-payment-dispatch.mjs';

const now = () => Date.parse('2026-11-26T23:00:00Z');
const order = {
  id: '123', number: 130, status: 'open', payment_status: 'pending',
  created_at: '2026-11-26T22:00:00Z', contact_email: 'test@example.com',
};
function fixture({ duplicate = false, paid = false, fail = false } = {}) {
  let reads = 0;
  let sends = 0;
  let state = '';
  const db = {
    from: () => ({
      insert: async () => ({ error: duplicate ? { code: '23505' } : null }),
      update: patch => ({
        match: () => ({
          eq: () => ({
            select: () => ({
              single: async () => { state = patch.state; return { data: { state } }; },
            }),
          }),
        }),
      }),
    }),
  };
  return {
    args: {
      db, organizationId: 'org', storeId: '123', entityType: 'order',
      entityId: '123', stage: 'payment_email_30m', now, enabled: true,
      readEntity: async () => ({ ...order, payment_status: paid && ++reads > 1 ? 'paid' : 'pending' }),
      isEligible: entity => entity.payment_status === 'pending',
      getEmail: entity => entity.contact_email,
      buildMessage: () => ({ subject: 'subject', text: 'text', html: '<p>text</p>' }),
      sendEmail: async () => { sends++; if (fail) throw new Error('provider unavailable'); return { id: 'receipt' }; },
    },
    get sends() { return sends; },
    get state() { return state; },
  };
}
test('disabled dispatch never sends', async () => {
  const sample = fixture();
  assert.equal((await dispatchRecoveryEmail({ ...sample.args, enabled: false })).state, 'disabled');
  assert.equal(sample.sends, 0);
});
test('duplicate claim never sends twice', async () => {
  const sample = fixture({ duplicate: true });
  assert.equal((await dispatchRecoveryEmail(sample.args)).state, 'duplicate');
  assert.equal(sample.sends, 0);
});
test('payment confirmed between reads is skipped', async () => {
  const sample = fixture({ paid: true });
  assert.equal((await dispatchRecoveryEmail(sample.args)).state, 'skipped');
  assert.equal(sample.sends, 0);
});
test('provider confirmation is recorded', async () => {
  const sample = fixture();
  assert.equal((await dispatchRecoveryEmail(sample.args)).state, 'sent');
  assert.equal(sample.sends, 1);
  assert.equal(sample.state, 'sent');
});
test('ambiguous provider failure is not retried automatically', async () => {
  const sample = fixture({ fail: true });
  assert.equal((await dispatchRecoveryEmail(sample.args)).state, 'uncertain');
  assert.equal(sample.sends, 1);
  assert.equal(sample.state, 'uncertain');
});
