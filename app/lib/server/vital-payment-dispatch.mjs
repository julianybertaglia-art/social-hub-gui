import { createHash } from 'node:crypto';

export async function dispatchRecoveryEmail({
  db, organizationId, storeId, entityType, entityId, stage, readEntity,
  isEligible, getEmail, buildMessage, sendEmail, now = Date.now, enabled = false,
}) {
  if (!enabled) return { state: 'disabled' };
  if (!['order', 'checkout'].includes(entityType) || !/^\d{1,20}$/.test(String(entityId || '')) ||
      !/^[a-z0-9_]{3,50}$/.test(String(stage || ''))) return { state: 'invalid' };

  const identity = {
    organization_id: organizationId,
    store_id: String(storeId),
    entity_type: entityType,
    entity_id: String(entityId),
    stage,
  };
  const emailFor = entity => String(getEmail(entity) || '').trim();
  const validEmail = email => /^\S+@\S+\.\S+$/.test(email);
  let entity;

  try { entity = await readEntity(); } catch { return { state: 'unavailable' }; }
  if (!entity || !(await isEligible(entity, now())) || !validEmail(emailFor(entity))) return { state: 'ineligible' };

  const { error } = await db.from('crm_vital_payment_recovery').insert({ ...identity, state: 'sending' });
  if (error?.code === '23505') return { state: 'duplicate' };
  if (error) throw new Error('ledger_unavailable');

  const finish = async (state, id = null) => {
    const result = await db.from('crm_vital_payment_recovery')
      .update({ state, provider_message_id: id, updated_at: new Date(now()).toISOString() })
      .match(identity).eq('state', 'sending').select('state').single();
    if (result.error || result.data?.state !== state) throw new Error('ledger_update_unavailable');
    return { state };
  };

  // The second read is the final payment/checkout check immediately before sending.
  try { entity = await readEntity(); } catch { return finish('uncertain'); }
  if (!entity || !(await isEligible(entity, now())) || !validEmail(emailFor(entity))) return finish('skipped');

  const idempotencyKey = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  let receipt;
  try {
    receipt = await sendEmail({
      to: emailFor(entity), ...buildMessage(entity), key: idempotencyKey,
    });
  } catch {
    return finish('uncertain');
  }
  if (!receipt?.id) return finish('uncertain');
  return finish('sent', String(receipt.id));
}

export function resendAdapter({ apiKey, from, fetcher = fetch }) {
  if (!apiKey || !/^Vital Decor <atendimento@vitaldecor\.com\.br>$/.test(from || '')) {
    throw new Error('email_not_configured');
  }
  return async ({ to, subject, text, html, key }) => {
    const response = await fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      body: JSON.stringify({ from, to: [to], subject, text, html, reply_to: 'atendimento@vitaldecor.com.br' }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('email_unconfirmed');
    const data = await response.json();
    if (!data?.id) throw new Error('email_unconfirmed');
    return { id: data.id };
  };
}
