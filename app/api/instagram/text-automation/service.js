import { createClient } from '@supabase/supabase-js';

const AUTOMATION_TABLE = 'instagram_text_automations';
const DELIVERY_TABLE = 'instagram_text_deliveries';
const API_VERSION = 'v26.0';
const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const CTA_DELAY_MS = 2 * 60 * 1000;
const CONFIG_FIELDS = [
  'id', 'ig_account_id', 'comment_keyword', 'public_reply', 'prompt_message',
  'quick_reply_title', 'quick_reply_payload', 'direct_keyword', 'followup_message',
  'menu_message', 'menu_buttons', 'active', 'flow_version',
].join(',');

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Supabase não configurado para a automação de texto.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function metaPost(path, body) {
  const accessToken = process.env.META_INSTAGRAM_ACCESS_TOKEN;
  if (!accessToken) throw new Error('Instagram não configurado para a automação de texto.');

  const response = await fetch(`https://graph.instagram.com/${API_VERSION}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.error) {
    throw new Error(result?.error?.message || `Erro Meta HTTP ${response.status}`);
  }
  return result;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function extractTextSelectionEvents(payload, now = Date.now()) {
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

function matchesTextAutomation(event, automation) {
  if (event.quickReplyPayload) return event.quickReplyPayload === automation.quick_reply_payload;
  const text = normalizeText(event.text);
  const keyword = normalizeText(automation.direct_keyword);
  return Boolean(keyword && text.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, '') === keyword)
    || Boolean(automation.quick_reply_title && text === normalizeText(automation.quick_reply_title));
}

function buildTextMenu(automation) {
  const text = String(automation.menu_message || '').trim();
  const buttons = Array.isArray(automation.menu_buttons) ? automation.menu_buttons : [];
  if (!text || buttons.length < 1 || buttons.length > 3) throw new Error('Menu da automação inválido.');

  return {
    attachment: {
      type: 'template',
      payload: {
        template_type: 'button',
        text,
        buttons: buttons.map((button) => ({
          type: 'web_url',
          title: String(button.title || '').trim().slice(0, 20),
          url: String(button.url || '').trim(),
        })),
      },
    },
  };
}

async function loadAutomations(db, accountId) {
  const { data, error } = await db.from(AUTOMATION_TABLE)
    .select(CONFIG_FIELDS)
    .eq('ig_account_id', accountId)
    .eq('active', true);
  if (error) throw error;
  return data || [];
}

export async function processTextCommentEvent(event, db = null) {
  const commentId = String(event?.value?.id || '');
  const accountId = String(event?.igUserId || '');
  const text = String(event?.value?.text || '');
  const username = String(event?.value?.from?.username || '');
  if (!commentId || !/^\d+$/.test(accountId) || !text) return false;

  db ||= serverClient();
  const automations = await loadAutomations(db, accountId);
  const normalizedComment = normalizeText(text);
  const automation = automations.find((candidate) => {
    const keyword = normalizeText(candidate.comment_keyword);
    return keyword && normalizedComment.includes(keyword);
  });
  if (!automation) return false;
  if (username.toLowerCase() === 'gui_nonato') return true;

  try {
    await metaPost(`${accountId}/messages`, {
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
  } catch (error) {
    console.error('Automação de texto: falha ao enviar Direct.', { commentId, error: error.message });
  }

  if (automation.public_reply) {
    try {
      await metaPost(`${commentId}/replies`, { message: automation.public_reply });
    } catch (error) {
      console.error('Automação de texto: falha na resposta pública.', { commentId, error: error.message });
    }
  }

  return true;
}

async function sendTextDelivery(db, event, automation) {
  const now = new Date().toISOString();
  const { data: delivery, error: claimError } = await db.from(DELIVERY_TABLE)
    .insert({
      automation_id: automation.id,
      recipient_id: event.senderId,
      incoming_message_id: event.messageId,
      flow_version: automation.flow_version,
      status: 'sending',
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .maybeSingle();

  if (claimError?.code === '23505') return false;
  if (claimError || !delivery?.id) throw claimError || new Error('Não foi possível registrar o envio.');

  let followupMessageId = '';
  try {
    const followup = await metaPost(`${event.accountId}/messages`, {
      recipient: { id: event.senderId },
      message: { text: automation.followup_message },
    });
    followupMessageId = String(followup?.message_id || '');
    if (!followupMessageId) throw new Error('Checklist não confirmado pelo Instagram.');

    await db.from(DELIVERY_TABLE).update({
      status: 'followup_sent',
      followup_message_id: followupMessageId,
      updated_at: new Date().toISOString(),
    }).eq('id', delivery.id);

    await wait(CTA_DELAY_MS);

    const menu = await metaPost(`${event.accountId}/messages`, {
      recipient: { id: event.senderId },
      message: buildTextMenu(automation),
    });
    const menuMessageId = String(menu?.message_id || '');
    if (!menuMessageId) throw new Error('Menu não confirmado pelo Instagram.');

    await db.from(DELIVERY_TABLE).update({
      status: 'sent',
      menu_message_id: menuMessageId,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', delivery.id);
  } catch (error) {
    await db.from(DELIVERY_TABLE).update({
      status: followupMessageId ? 'partial' : 'failed',
      error_message: String(error?.message || 'Envio não confirmado.').slice(0, 420),
      updated_at: new Date().toISOString(),
    }).eq('id', delivery.id);
    console.error('Automação de texto: envio não confirmado.', { deliveryId: delivery.id });
  }

  return true;
}

export async function processTextSelections(payload, db = null) {
  const events = extractTextSelectionEvents(payload);
  if (!events.length) return;

  db ||= serverClient();
  const cache = new Map();
  for (const event of events) {
    let automations = cache.get(event.accountId);
    if (!automations) {
      automations = await loadAutomations(db, event.accountId);
      cache.set(event.accountId, automations);
    }

    const automation = automations.find((candidate) => matchesTextAutomation(event, candidate));
    if (automation) await sendTextDelivery(db, event, automation);
  }
}
