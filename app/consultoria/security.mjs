import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { applicationError } from '../lib/consultoria.mjs';

function key() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw applicationError('O formulário está temporariamente indisponível.', 503);
  return secret;
}
const sign = (value, secret) => createHmac('sha256', secret).update('consultoria-form:' + value).digest('hex');
export function formTicket(secret = key(), now = Date.now()) {
  const value = randomUUID() + '.' + now;
  return value + '.' + sign(value, secret);
}
export function verifyTicket(ticket, secret = key(), now = Date.now()) {
  const parts = String(ticket || '').split('.');
  if (parts.length !== 3 || !/^[0-9a-f-]{36}$/.test(parts[0]) || !/^\d{13}$/.test(parts[1]) || !/^[0-9a-f]{64}$/.test(parts[2])) {
    throw applicationError('Reabra o formulário para enviar sua candidatura.', 403);
  }
  const expected = Buffer.from(sign(parts[0] + '.' + parts[1], secret), 'hex');
  if (!timingSafeEqual(expected, Buffer.from(parts[2], 'hex')) || Number(parts[1]) > now || now - Number(parts[1]) > 2 * 3600000) {
    throw applicationError('Seu formulário expirou. Reabra a página para continuar.', 403);
  }
  return parts[0];
}
export function requestFingerprint(request, secret = key()) {
  const address = request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for') || 'unknown';
  return createHmac('sha256', secret).update('consultoria-rate:' + address.split(',')[0].trim()).digest('hex');
}
