import { createClient } from '@supabase/supabase-js';

export const WHATSAPP_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v26.0';

export function getWhatsAppProvider() {
  return String(process.env.WHATSAPP_PROVIDER || 'meta').toLowerCase() === 'baileys'
    ? 'baileys'
    : 'meta';
}

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

export function normalizeWhatsAppRecipient(value) {
  const raw = String(value || '').trim();
  if (raw.endsWith('@g.us') || raw.endsWith('@s.whatsapp.net')) return raw;
  return normalizeWaId(raw);
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
  return message.text || '[' + (message.type || 'mensagem') + ']';
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

function whatsappCredentials() {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    const error = new Error('WhatsApp ainda não foi conectado na Meta.');
    error.code = 'WHATSAPP_NOT_CONFIGURED';
    throw error;
  }

  return { accessToken, phoneNumberId };
}

function bridgeCredentials() {
  const baseUrl = String(process.env.WHATSAPP_BRIDGE_URL || '').replace(/\/+$/, '');
  const token = String(process.env.WHATSAPP_BRIDGE_TOKEN || '');

  if (!baseUrl || !token) {
    const error = new Error('A ponte Baileys ainda não foi configurada no Lynna.');
    error.code = 'WHATSAPP_BRIDGE_NOT_CONFIGURED';
    throw error;
  }

  return { baseUrl, token };
}

export function isWhatsAppBridgeConfigured() {
  return Boolean(process.env.WHATSAPP_BRIDGE_URL && process.env.WHATSAPP_BRIDGE_TOKEN);
}

async function bridgeRequest(route, options = {}) {
  const { baseUrl, token } = bridgeCredentials();
  const response = await fetch(baseUrl + route, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    const error = new Error(payload?.error || 'A ponte do WhatsApp não respondeu corretamente.');
    error.code = payload?.code || response.status;
    throw error;
  }

  return payload;
}

export async function getWhatsAppBridgeStatus() {
  return bridgeRequest('/status');
}

export async function controlWhatsAppBridge(action) {
  if (!['connect', 'disconnect', 'relink'].includes(action)) {
    const error = new Error('Ação da ponte inválida.');
    error.code = 'INVALID_BRIDGE_ACTION';
    throw error;
  }

  return bridgeRequest('/' + action, { method: 'POST', body: '{}' });
}

export async function getWhatsAppBridgeGroups() {
  return bridgeRequest('/groups');
}

async function postWhatsAppMessage(body) {
  const { accessToken, phoneNumberId } = whatsappCredentials();
  const response = await fetch(
    'https://graph.facebook.com/' + WHATSAPP_API_VERSION + '/' + phoneNumberId + '/messages',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    const error = new Error(payload?.error?.message || 'Erro Meta HTTP ' + response.status);
    error.code = payload?.error?.code || response.status;
    throw error;
  }
  return payload;
}

export async function sendWhatsAppText({ to, text }) {
  if (getWhatsAppProvider() === 'baileys') {
    return bridgeRequest('/messages/text', {
      method: 'POST',
      body: JSON.stringify({
        to: normalizeWhatsAppRecipient(to),
        text,
      }),
    });
  }

  return postWhatsAppMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizeWaId(to),
    type: 'text',
    text: { preview_url: false, body: text },
  });
}

export async function sendWhatsAppVoiceByUrl({ to, audioUrl }) {
  if (getWhatsAppProvider() === 'baileys') {
    let url;
    try {
      url = new URL(audioUrl);
    } catch {
      throw new Error('URL do áudio inválida.');
    }

    if (url.protocol !== 'https:') {
      throw new Error('Para a ponte Baileys, use um arquivo de áudio HTTPS.');
    }

    return bridgeRequest('/messages/audio', {
      method: 'POST',
      body: JSON.stringify({
        to: normalizeWhatsAppRecipient(to),
        audioUrl: url.href,
      }),
    });
  }

  let url;
  try {
    url = new URL(audioUrl);
  } catch {
    throw new Error('URL do áudio inválida.');
  }

  if (url.protocol !== 'https:' || !url.pathname.toLowerCase().endsWith('.ogg')) {
    throw new Error('Para mensagem de voz, use um arquivo HTTPS .ogg codificado em Opus.');
  }

  return postWhatsAppMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizeWaId(to),
    type: 'audio',
    audio: {
      link: url.href,
      voice: true,
    },
  });
}
