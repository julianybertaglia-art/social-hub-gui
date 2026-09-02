import { automationError } from '../../api/instagram/audio-automation/service.js';

export const CONTACTS_TABLE = 'argo_update_contacts';
export const CONSENT_TEXT = 'Quero receber novidades do Argo pelo WhatsApp.';

export function validateContact(values) {
  const name = String(values.name || '').trim().replace(/\s+/g, ' ');
  const phone = String(values.whatsapp || '').trim();
  if (name.length < 2 || name.length > 100) {
    throw automationError('Preencha seu nome, com pelo menos duas letras.', 400);
  }
  if (!/^[+\d\s().-]+$/.test(phone)) {
    throw automationError('Preencha um WhatsApp válido, com DDD.', 400);
  }
  const digits = phone.replace(/\D/g, '');
  const whatsapp = [10, 11].includes(digits.length) ? `55${digits}` : digits;
  if (!/^55[1-9]\d(?:9\d{8}|[2-5]\d{7})$/.test(whatsapp)) {
    throw automationError('Preencha um WhatsApp válido, com DDD. Exemplo: (11) 91234-5678.', 400);
  }
  if (values.consent !== 'yes') {
    throw automationError('Marque a opção para autorizar o recebimento das novidades.', 400);
  }
  return { name, whatsapp };
}

export async function saveContact(db, contact) {
  const { data: automation, error: ownerError } = await db.from('instagram_audio_automations')
    .select('id,user_id')
    .eq('slug', 'argo-audio')
    .maybeSingle();
  if (ownerError || !automation?.id || !automation?.user_id) {
    throw automationError('O cadastro está indisponível neste momento. Tente novamente em instantes.', 503);
  }

  const { error } = await db.from(CONTACTS_TABLE).insert({
    automation_id: automation.id,
    user_id: automation.user_id,
    name: contact.name,
    whatsapp: contact.whatsapp,
    consent_text: CONSENT_TEXT,
    consented_at: new Date().toISOString(),
    source: 'argo_updates_form',
  });
  // A second submission neither changes a saved contact nor reveals whether it exists.
  if (error && error.code !== '23505') {
    throw automationError('Não foi possível salvar seu contato. Tente novamente em instantes.', 503);
  }
}

export async function listOwnerContacts(db, userId) {
  const { data, count, error } = await db.from(CONTACTS_TABLE)
    .select('id,name,whatsapp,consented_at', { count: 'exact' })
    .eq('user_id', userId)
    .order('consented_at', { ascending: false })
    .limit(100);
  if (error) throw automationError('Não foi possível carregar os cadastros do Argo.', 503);
  return { contacts: data || [], total: count || 0 };
}
