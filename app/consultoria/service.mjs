import { CONSULTORIA_OWNER, CONSULTORIA_CAMPAIGN, applicationError } from '../lib/consultoria.mjs';

export async function saveConsultoria(db, values, { id, fingerprint }) {
  const { count, error: limitError } = await db.from('consultoria_applications').select('id', { count: 'exact', head: true })
    .eq('request_hash', fingerprint).gte('created_at', new Date(Date.now() - 15 * 60000).toISOString());
  if (limitError) throw applicationError('Não foi possível receber sua candidatura agora. Tente novamente em instantes.', 503);
  if (count >= 5) throw applicationError('Muitos envios em pouco tempo. Aguarde alguns minutos e tente novamente.', 429);
  const { error } = await db.from('consultoria_applications').insert({
    ...values, id, owner_id: CONSULTORIA_OWNER, campaign: CONSULTORIA_CAMPAIGN,
    request_hash: fingerprint, consent_at: new Date().toISOString(),
  });
  // A repeated submit or phone number must never overwrite an existing review or leak its data.
  if (error && error.code !== '23505') throw applicationError('Não foi possível salvar sua candidatura. Tente novamente.', 503);
  return { ok: true };
}
