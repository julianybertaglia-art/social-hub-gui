import { createClient } from '@supabase/supabase-js';

export const AUTOMATION_TABLE = 'instagram_audio_automations';
export const DELIVERY_TABLE = 'instagram_audio_deliveries';

const API_VERSION = 'v26.0';
const MAX_EVENT_AGE_MS = 8 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const CONFIG_FIELDS = [
  'id', 'user_id', 'name', 'slug', 'ig_account_id', 'comment_keyword', 'public_reply',
  'prompt_message', 'quick_reply_title', 'quick_reply_payload', 'audio_bucket', 'audio_path',
  'whatsapp_message', 'active', 'created_at', 'updated_at',
].join(',');

export function automationError(message, status = 500) {
  return Object.assign(new Error(message), { status });
}

export function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw automationError('A conexão do Hub com o banco precisa ser configurada.', 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function authorizedOwner(request, db) {
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) throw automationError('Entre no Hub para acessar a automação.', 401);

  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user?.id) throw automationError('Sua sessão expirou. Entre novamente no Hub.', 401);

  const { data: state, error: stateError } = await db.from('content_items')
    .select('id')
    .eq('title', '__SOCIAL_HUB_STATE__')
    .eq('user_id', data.user.id)
    .maybeSingle();

  if (stateError) throw automationError('Não foi possível verificar seu acesso. Tente novamente.', 503);
  if (!state) throw automationError('Esta conta não tem acesso à automação do Gui.', 403);
  return data.user.id;
}

export function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function safeDetail(error, token = '') {
  let detail = String(error?.error_user_msg || error?.message || '');
  if (token) detail = detail.split(token).join('[credencial]');
  return detail
    .replace(/https?:\/\/[^\s"<>]+/gi, '[endereço de mídia]')
    .replace(/\b(?:access_token|token|apikey)\s*[=:]\s*[^\s&,]+/gi, '[credencial]')
    .replace(/[A-Za-z0-9_+/=-]{60,}/g, '[identificador]')
    .replace(/\b\d{12,}\b/g, '[identificador]')
    .slice(0, 420);
}

async function metaRequest(path, body) {
  const token = process.env.META_INSTAGRAM_ACCESS_TOKEN;
  if (!token) throw automationError('A conexão do Instagram precisa ser configurada no Hub.', 503);

  const response = await fetch(`https://graph.instagram.com/${API_VERSION}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.error) {
    const code = Number(result?.error?.code);
    const subcode = Number(result?.error?.error_subcode);
    const detail = safeDetail(result?.error, token);
    const diagnostic = Number.isFinite(code)
      ? ` (código ${code}${Number.isFinite(subcode) ? `/${subcode}` : ''})`
      : '';
    throw automationError(
      `O Instagram recusou a solicitação${diagnostic}.${detail ? ` ${detail}` : ' Confira a conexão do Instagram no Hub.'}`,
      502
    );
  }
  return result;
}

async function ownerAutomation(db, userId) {
  const { data, error } = await db.from(AUTOMATION_TABLE)
    .select(CONFIG_FIELDS)
    .eq('user_id', userId)
    .eq('slug', 'argo-audio')
    .maybeSingle();

  if (error) throw automationError('Não foi possível carregar a automação do ARGO.', 503);
  return data;
}

export async function getOwnerAutomation(db, userId) {
  return ownerAutomation(db, userId);
}

async function ensureSubscription(accountId) {
  const subscriptions = await metaRequest(`${accountId}/subscribed_apps`);
  if (!Array.isArray(subscriptions.data)) {
    throw automationError('Não foi possível verificar o recebimento de mensagens.', 502);
  }

  const fields = new Set(subscriptions.data.flatMap((app) => app.subscribed_fields || []));
  fields.add('comments');
  fields.add('messages');
  fields.add('messaging_postbacks');

  const result = await metaRequest(`${accountId}/subscribed_apps`, {
    subscribed_fields: [...fields].join(','),
  });

  if (result.success !== true) {
    throw automationError('O Instagram não confirmou o recebimento do botão de áudio.', 502);
  }
}

export async function setAutomationActive(db, userId, active) {
  const automation = await ownerAutomation(db, userId);
  if (!automation) throw automationError('O áudio oficial ainda não está pronto no Hub.', 404);

  if (!active) {
    const { data, error } = await db.from(AUTOMATION_TABLE)
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', automation.id)
      .eq('user_id', userId)
      .select(CONFIG_FIELDS)
      .maybeSingle();
    if (error || !data) throw automationError('Não foi possível pausar a automação.', 503);
    return data;
  }

  if (!automation.audio_path?.endsWith('.m4a') || !automation.audio_bucket) {
    throw automationError('O áudio oficial precisa estar em M4A/AAC antes de ativar.', 422);
  }

  const { data: signedAudio, error: signedAudioError } = await db.storage
    .from(automation.audio_bucket)
    .createSignedUrl(automation.audio_path, 60);
  if (signedAudioError || !signedAudio?.signedUrl) {
    throw automationError('Não foi possível acessar o áudio privado para ativar.', 503);
  }

  const profile = await metaRequest('me?fields=user_id,username');
  const accountId = String(profile.user_id || profile.id || '');
  if (String(profile.username || '').toLowerCase() !== 'gui_nonato' || !/^\d+$/.test(accountId)) {
    throw automationError('A conta conectada precisa ser @gui_nonato.', 403);
  }

  await ensureSubscription(accountId);

  const { data, error } = await db.from(AUTOMATION_TABLE)
    .update({ active: true, ig_account_id: accountId, updated_at: new Date().toISOString() })
    .eq('id', automation.id)
    .eq('user_id', userId)
    .select(CONFIG_FIELDS)
    .maybeSingle();
  if (error || !data) throw automationError('Não foi possível ativar a automação.', 503);
  return data;
}

export async function loadActiveAudioAutomations(accountId) {
  if (!/^\d+$/.test(String(accountId || ''))) return [];
  const db = serverClient();
  const { data, error } = await db.from(AUTOMATION_TABLE)
    .select(CONFIG_FIELDS)
    .eq('ig_account_id', String(accountId))
    .eq('active', true);
  if (error) throw automationError('Não foi possível carregar a automação de áudio.', 503);
  return data || [];
}

export function findAudioAutomationForComment(text, automations) {
  const comment = normalizeText(text);
  return (automations || []).find((automation) => {
    const keyword = normalizeText(automation.comment_keyword);
    return keyword && comment.includes(keyword);
  }) || null;
}

export async function sendAudioPrompt(igUserId, commentId, automation) {
  return metaRequest(`${igUserId}/messages`, {
    recipient: { comment_id: commentId },
    message: {
      text: automation.prompt_message,
      quick_replies: [{
        content_type: 'text',
        title: automation.quick_reply_title,
        payload: automation.quick_reply_payload,
      }],
    },
  });
}

export function extractAudioSelectionEvents(payload, now = Date.now()) {
  if (payload?.object !== 'instagram' || !Array.isArray(payload.entry)) return [];

  return payload.entry.flatMap((entry) => (Array.isArray(entry?.messaging) ? entry.messaging : []).flatMap((event) => {
    const message = event?.message || {};
    const postback = event?.postback || {};
    const senderId = String(event?.sender?.id || '');
    const accountId = String(entry?.id || '');
    const recipientId = String(event?.recipient?.id || '');
    const timestamp = Number(event?.timestamp);
    const messageId = String(message?.mid || postback?.mid || '');
    const quickReplyPayload = String(message?.quick_reply?.payload || postback?.payload || '').trim();
    const text = String(message?.text || postback?.title || '').trim();

    if (!messageId || (!quickReplyPayload && !text) || message?.is_echo || message?.is_deleted
      || !/^\d+$/.test(senderId) || !/^\d+$/.test(accountId) || senderId === accountId
      || recipientId !== accountId || !Number.isFinite(timestamp)
      || timestamp < now - MAX_EVENT_AGE_MS || timestamp > now + MAX_FUTURE_SKEW_MS) return [];

    return [{ accountId, senderId, messageId, quickReplyPayload, text, timestamp }];
  }));
}

function selectionMatches(event, automation) {
  if (event.quickReplyPayload) return event.quickReplyPayload === automation.quick_reply_payload;
  return normalizeText(event.text) === normalizeText(automation.quick_reply_title);
}

export async function sendAudioDelivery(db, event, automation) {
  const now = new Date().toISOString();
  const { data: delivery, error: claimError } = await db.from(DELIVERY_TABLE)
    .insert({
      automation_id: automation.id,
      recipient_id: event.senderId,
      incoming_message_id: event.messageId,
      status: 'sending',
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .maybeSingle();

  if (claimError) {
    if (claimError.code === '23505') return false;
    throw automationError('Não foi possível registrar o envio do áudio.', 503);
  }
  if (!delivery?.id) return false;

  let audioMessageId = null;
  try {
    const { data: media, error: mediaError } = await db.storage
      .from(automation.audio_bucket)
      .createSignedUrl(automation.audio_path, 600);
    if (mediaError || !media?.signedUrl) {
      throw automationError('Não foi possível preparar o áudio privado para o Instagram.', 503);
    }

    const audioResult = await metaRequest(`${event.accountId}/messages`, {
      recipient: { id: event.senderId },
      message: { attachment: { type: 'audio', payload: { url: media.signedUrl } } },
    });
    audioMessageId = String(audioResult?.message_id || '');
    if (!audioMessageId) throw automationError('O Instagram não confirmou o envio do áudio.', 502);

    const { error: audioSaveError } = await db.from(DELIVERY_TABLE)
      .update({ status: 'audio_sent', audio_message_id: audioMessageId, updated_at: new Date().toISOString() })
      .eq('id', delivery.id)
      .eq('status', 'sending');
    if (audioSaveError) throw automationError('O áudio foi enviado, mas não foi possível registrar o envio.', 503);

    const whatsappResult = await metaRequest(`${event.accountId}/messages`, {
      recipient: { id: event.senderId },
      message: { text: automation.whatsapp_message },
    });
    const whatsappMessageId = String(whatsappResult?.message_id || '');
    if (!whatsappMessageId) throw automationError('O Instagram não confirmou o envio do WhatsApp da equipe.', 502);

    const { error: completeError } = await db.from(DELIVERY_TABLE)
      .update({
        status: 'sent',
        whatsapp_message_id: whatsappMessageId,
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', delivery.id)
      .eq('status', 'audio_sent');
    if (completeError) throw automationError('O áudio e o WhatsApp foram enviados, mas o registro não foi atualizado.', 503);
  } catch (error) {
    // An uncertain response from Meta must never trigger an automatic resend of the audio.
    const status = audioMessageId ? 'partial' : 'failed';
    await db.from(DELIVERY_TABLE)
      .update({
        status,
        error_message: error?.status ? error.message : 'O envio não foi confirmado. Confira o Direct antes de repetir.',
        updated_at: new Date().toISOString(),
      })
      .eq('id', delivery.id)
      .in('status', ['sending', 'audio_sent']);
    console.error('Automação de áudio ARGO: envio não confirmado.', { deliveryId: delivery.id, status });
  }
  return true;
}

export async function processAudioSelections(payload) {
  const events = extractAudioSelectionEvents(payload);
  if (!events.length) return;

  const db = serverClient();
  const cache = new Map();
  for (const event of events) {
    let automations = cache.get(event.accountId);
    if (!automations) {
      const { data, error } = await db.from(AUTOMATION_TABLE)
        .select(CONFIG_FIELDS)
        .eq('ig_account_id', event.accountId)
        .eq('active', true);
      if (error) throw automationError('Não foi possível carregar a automação de áudio.', 503);
      automations = data || [];
      cache.set(event.accountId, automations);
    }

    const automation = automations.find((candidate) => selectionMatches(event, candidate));
    if (automation) await sendAudioDelivery(db, event, automation);
  }
}
