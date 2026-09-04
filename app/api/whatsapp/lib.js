import { createClient } from '@supabase/supabase-js';

export const WHATSAPP_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v26.0';

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error('Supabase do servidor não configurado.');
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function normalizeWaId(value) {
  return String(value || '').replace(/\D/g, '');
}

export function messageBody(message) {
  if (!message) return '';
  if (message.type === 'text') return message.text?.body || '';
  if (message.type === 'button') return message.button?.text || 'Botão';
  if (message.type === 'interactive') {
    return message.interactive?.button_reply?.title
      || message.interactive?.list_reply?.title
      || 'Resposta interativa';
  }
  if (message.type === 'image') return message.image?.caption || '📷 Imagem';
  if (message.type === 'video') return message.video?.caption || '🎥 Vídeo';
  if (message.type === 'audio') return '🎵 Áudio';
  if (message.type === 'document') return message.document?.filename || '📎 Documento';
  if (message.type === 'sticker') return '🖼️ Figurinha';
  if (message.type === 'location') return '📍 Localização';
  if (message.type === 'contacts') return '👤 Contato';
  return `[${message.type || 'mensagem'}]`;
}

export async function upsertWhatsAppContact(supabase, {
  waId,
  profileName,
  source = 'WhatsApp',
  lastMessageAt = new Date().toISOString(),
}) {
  const normalized = normalizeWaId(waId);
  if (!normalized) throw new Error('wa_id inválido.');

  const { data: existing, error: readError } = await supabase
    .from('whatsapp_contacts')
    .select('*')
    .eq('wa_id', normalized)
    .maybeSingle();

  if (readError) throw readError;

  if (existing) {
    const patch = {
      phone: existing.phone || normalized,
      source: source || existing.source || 'WhatsApp',
      last_message_at: lastMessageAt,
      updated_at: new Date().toISOString(),
    };
    if (profileName) patch.profile_name = profileName;

    const { data, error } = await supabase
      .from('whatsapp_contacts')
      .update(patch)
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('whatsapp_contacts')
    .insert({
      wa_id: normalized,
      phone: normalized,
      profile_name: profileName || null,
      source,
      stage: 'Novo lead',
      last_message_at: lastMessageAt,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function sendWhatsAppText({ to, text }) {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    const error = new Error('WhatsApp ainda não foi conectado na Meta.');
    error.code = 'WHATSAPP_NOT_CONFIGURED';
    throw error;
  }

  const response = await fetch(
    `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizeWaId(to),
        type: 'text',
        text: { preview_url: false, body: text },
      }),
      cache: 'no-store',
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Erro Meta HTTP ${response.status}`);
  }

  return payload;
}
