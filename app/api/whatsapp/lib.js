import { createClient } from '@supabase/supabase-js';

export const WHATSAPP_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v26.0';

export function getWhatsAppProvider() {
  // O Hub usa exclusivamente a conexão oficial da Meta.
  return 'meta';
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

export async function getStoredMetaConnection() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('whatsapp_meta_connections')
      .select('id,waba_id,phone_number_id,access_token,display_phone_number,verified_name,coexistence,connected_at,updated_at')
      .eq('id', 'primary')
      .maybeSingle();

    if (error) throw error;
    return data || null;
  } catch (error) {
    console.error('WhatsApp Meta connection:', error);
    return null;
  }
}

export async function getMetaCredentials() {
  const stored = await getStoredMetaConnection();
  if (stored?.access_token && stored?.phone_number_id) {
    return {
      source: 'meta_embedded_signup',
      accessToken: stored.access_token,
      phoneNumberId: stored.phone_number_id,
      wabaId: stored.waba_id || null,
      displayPhoneNumber: stored.display_phone_number || null,
      verifiedName: stored.verified_name || null,
      coexistence: Boolean(stored.coexistence),
      stored,
    };
  }

  const accessToken = String(process.env.META_WHATSAPP_ACCESS_TOKEN || '').trim();
  const phoneNumberId = String(process.env.META_WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const wabaId = String(
    process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID
      || process.env.META_WHATSAPP_WABA_ID
      || ''
  ).trim();

  if (accessToken && phoneNumberId) {
    return {
      source: 'meta_environment',
      accessToken,
      phoneNumberId,
      wabaId: wabaId || null,
      displayPhoneNumber: null,
      verifiedName: null,
      coexistence: true,
      stored: null,
    };
  }

  return null;
}

export function normalizeWaId(value) {
  return String(value || '').replace(/\D/g, '');
}

export function isMetaRateLimitCode(value) {
  return Number(value) === 80008;
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
    return { ...data, _wasExistingBeforeUpsert: true };
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
  return { ...data, _wasExistingBeforeUpsert: false };
}

async function whatsappCredentials() {
  const credentials = await getMetaCredentials();
  if (credentials?.accessToken && credentials?.phoneNumberId) {
    return credentials;
  }

  const error = new Error('Conclua a conexão oficial do WhatsApp pela Meta antes de enviar.');
  error.code = 'WHATSAPP_NOT_CONFIGURED';
  throw error;
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
  return Boolean(
    String(process.env.WHATSAPP_BRIDGE_URL || '').trim()
    && String(process.env.WHATSAPP_BRIDGE_TOKEN || '').trim()
  );
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

export async function createWhatsAppBridgeGroup({ subject, participants }) {
  const safeSubject = String(subject || '').trim();
  const safeParticipants = Array.isArray(participants)
    ? participants.map((value) => String(value || '').trim()).filter(Boolean)
    : [];

  if (!safeSubject) throw new Error('Informe o nome do grupo.');
  if (!safeParticipants.length) throw new Error('Adicione pelo menos um participante.');

  return bridgeRequest('/groups', {
    method: 'POST',
    body: JSON.stringify({
      subject: safeSubject,
      participants: safeParticipants,
    }),
  });
}

export async function addWhatsAppBridgeGroupParticipants({ jid, participants }) {
  const safeJid = String(jid || '').trim();
  const safeParticipants = Array.isArray(participants)
    ? participants.map((value) => String(value || '').trim()).filter(Boolean)
    : [];

  if (!safeJid) throw new Error('Grupo inválido.');
  if (!safeParticipants.length) throw new Error('Adicione pelo menos um participante.');

  return bridgeRequest('/groups/participants', {
    method: 'POST',
    body: JSON.stringify({
      jid: safeJid,
      participants: safeParticipants,
    }),
  });
}

async function postWhatsAppMessage(body) {
  const { accessToken, phoneNumberId } = await whatsappCredentials();
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

export async function sendWhatsAppInteractiveList({ to, body, button, sections }) {
  const safeBody = String(body || '').trim();
  const safeButton = String(button || '').trim();
  const safeSections = Array.isArray(sections) ? sections.map((section) => ({
    title: String(section?.title || '').trim().slice(0, 24),
    rows: Array.isArray(section?.rows) ? section.rows.map((row) => ({
      id: String(row?.id || '').trim().slice(0, 200),
      title: String(row?.title || '').trim().slice(0, 24),
      description: String(row?.description || '').trim().slice(0, 72),
    })).filter((row) => row.id && row.title).slice(0, 10) : [],
  })).filter((section) => section.rows.length).slice(0, 10) : [];

  if (!safeBody || safeBody.length > 1024) throw new Error('O texto do menu do WhatsApp é inválido.');
  if (!safeButton || safeButton.length > 20) throw new Error('O botão do menu do WhatsApp é inválido.');
  if (!safeSections.length) throw new Error('O menu do WhatsApp precisa ter pelo menos uma opção.');

  return postWhatsAppMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizeWaId(to),
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: safeBody },
      action: {
        button: safeButton,
        sections: safeSections,
      },
    },
  });
}

export function buildWhatsAppCtaUrlMessage({ to, body, buttonText, url }) {
  const safeBody = String(body || '').trim();
  const safeButtonText = String(buttonText || '').trim();
  let safeUrl;

  try {
    safeUrl = new URL(String(url || '').trim());
  } catch {
    throw new Error('O link do botão do WhatsApp é inválido.');
  }

  if (!safeBody || safeBody.length > 1024) throw new Error('O texto da mensagem do WhatsApp é inválido.');
  if (!safeButtonText || safeButtonText.length > 20) throw new Error('O texto do botão do WhatsApp é inválido.');
  if (safeUrl.protocol !== 'https:') throw new Error('O botão do WhatsApp precisa usar um link HTTPS.');

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizeWaId(to),
    type: 'interactive',
    interactive: {
      type: 'cta_url',
      body: { text: safeBody },
      action: {
        name: 'cta_url',
        parameters: {
          display_text: safeButtonText,
          url: safeUrl.toString(),
        },
      },
    },
  };
}

export async function sendWhatsAppCtaUrl(options) {
  return postWhatsAppMessage(buildWhatsAppCtaUrlMessage(options));
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

  if (url.protocol !== 'https:') {
    throw new Error('Para mensagem de voz, use um arquivo HTTPS em formato OGG/Opus.');
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
