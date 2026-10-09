import { GUI_INSTAGRAM_ID } from '../helpers.mjs';

const API_VERSION = 'v26.0';
export const VITAL_WHATSAPP = '5511965765247';
export const VITAL_WELCOME_TEXT = 'Olá! 👋 Seja bem-vindo à Vital Decor!\n\nPara oferecer um atendimento mais rápido e organizado, nossa equipe atende pelo WhatsApp. 💚\n\nToque no botão abaixo para falar com a gente.';
export const VITAL_WHATSAPP_LINK = 'https://wa.me/' + VITAL_WHATSAPP + '?text=' + encodeURIComponent('Olá, vim pelo Instagram da Vital Decor e gostaria de atendimento.');

function id(value) {
  const result = String(value || '');
  return /^\d{5,40}$/.test(result) ? result : '';
}

export function extractVitalDirectMessages(payload) {
  if (payload?.object !== 'instagram' || !Array.isArray(payload?.entry)) return [];
  return payload.entry.flatMap((entry) => {
    const accountId = id(entry?.id);
    if (!accountId || accountId === GUI_INSTAGRAM_ID) return [];
    return (Array.isArray(entry.messaging) ? entry.messaging : []).flatMap((event) => {
      const senderId = id(event?.sender?.id);
      const message = event?.message;
      if (!senderId || senderId === accountId || !message?.mid
          || message.is_echo || message.is_deleted || message.is_unsupported
          || message.quick_reply?.payload || event.postback) return [];
      // Do not interrupt click-through or keyword-triggered flows.
      return [{ accountId, senderId, messageId: String(message.mid).slice(0, 500) }];
    });
  });
}

async function sendMetaMessage(connection, senderId, message) {
  const response = await fetch('https://graph.facebook.com/' + API_VERSION + '/' + connection.external_account_id + '/messages', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + connection.access_token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipient: { id: senderId }, message }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.error) throw new Error('Meta Instagram Direct HTTP ' + response.status + ' / ' + (result?.error?.code || 'unknown'));
  return result;
}

export async function processVitalInstagramDirect(payload, db) {
  const events = extractVitalDirectMessages(payload);
  if (!events.length) return 0;
  const uniqueAccounts = [...new Set(events.map((event) => event.accountId))];
  const { data: rows, error } = await db.from('workspace_meta_connections')
    .select('id,workspace_id,platform,external_account_id,access_token,state,automatic_replies_enabled')
    .eq('workspace_id', 'vital-decor').eq('platform', 'instagram')
    .eq('state', 'connected').eq('automatic_replies_enabled', true)
    .in('external_account_id', uniqueAccounts);
  if (error) throw error;
  const byAccount = new Map((rows || []).filter((row) => row.access_token && row.external_account_id !== GUI_INSTAGRAM_ID)
    .map((row) => [String(row.external_account_id), row]));
  let sent = 0;
  for (const event of events) {
    const connection = byAccount.get(event.accountId);
    if (!connection) continue;
    const { data: shouldReply, error: claimError } = await db.rpc('claim_vital_instagram_direct_reply', {
      p_connection_id: connection.id,
      p_sender_ig_id: event.senderId,
      p_message_id: event.messageId,
    });
    if (claimError) throw claimError;
    if (!shouldReply) continue;
    try {
      await sendMetaMessage(connection, event.senderId, {
        attachment: { type: 'template', payload: {
          template_type: 'button',
          text: VITAL_WELCOME_TEXT,
          buttons: [{ type: 'web_url', url: VITAL_WHATSAPP_LINK, title: 'Abrir WhatsApp' }],
        } },
      });
    } catch (templateError) {
      console.warn('Vital Instagram: template unavailable, sending text with link.', templateError.message);
      await sendMetaMessage(connection, event.senderId, { text: VITAL_WELCOME_TEXT + '\n\n' + VITAL_WHATSAPP_LINK });
    }
    sent += 1;
  }
  return sent;
}
