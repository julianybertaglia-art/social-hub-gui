import { GUI_INSTAGRAM_ID } from '../helpers.mjs';

const API_VERSION = 'v26.0';
import { VITAL_WELCOME_TEXT, VITAL_WHATSAPP_LINK, VITAL_STORE_LINK } from '../../../lib/vital-direct-copy.mjs';
export { VITAL_WHATSAPP, VITAL_WHATSAPP_DISPLAY, VITAL_STORE_LINK, VITAL_WELCOME_TEXT, VITAL_WHATSAPP_LINK } from '../../../lib/vital-direct-copy.mjs';

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
  const response = await fetch((connection.auth_provider === 'instagram_login' ? 'https://graph.instagram.com/' : 'https://graph.facebook.com/') + API_VERSION + '/' + connection.external_account_id + '/messages', {
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
  if (!response.ok || result?.error) {
    // Only an explicit client rejection proves the template was not sent.
    // Timeouts, throttling and server errors can have an ambiguous outcome.
    const rejected = response.status >= 400 && response.status < 500 &&
      response.status !== 408 && response.status !== 429;
    throw Object.assign(new Error('Meta Instagram Direct HTTP ' + response.status), {
      templateRejected: rejected,
    });
  }
  if (typeof result?.message_id !== 'string' || !result.message_id.trim()) {
    throw new Error('Meta did not confirm the Direct message ID');
  }
  return result;
}

// Reuse the existing, account-scoped delivery ledger. Its (account_id,
// message_id) primary key prevents concurrent webhook retries from sending
// the same incoming message twice, without changing Gui's records.
async function claimDelivery(db, event) {
  const { data, error } = await db.from('instagram_direct_keyword_deliveries')
    .insert({
      account_id: event.accountId,
      message_id: event.messageId,
      sender_id: event.senderId,
      flow_id: 'vital-direct-welcome-v1',
      keyword: 'BOAS_VINDAS',
      status: 'processing',
    }).select('message_id').maybeSingle();
  if (error?.code === '23505') return false;
  if (error || !data) throw new Error('Vital Direct delivery could not be recorded');
  return true;
}

async function updateDelivery(db, event, status, errorMessage = null) {
  const { error } = await db.from('instagram_direct_keyword_deliveries')
    .update({ status, error_message: errorMessage, updated_at: new Date().toISOString() })
    .eq('account_id', event.accountId).eq('message_id', event.messageId);
  if (error) console.error('VITAL:IG:DIRECT: delivery status could not be recorded');
}

export async function processVitalInstagramDirect(payload, db) {
  const events = extractVitalDirectMessages(payload);
  if (!events.length) return 0;
  const uniqueAccounts = [...new Set(events.map((event) => event.accountId))];
  const { data: rows, error } = await db.from('workspace_meta_connections')
    .select('id,workspace_id,platform,external_account_id,username,access_token,auth_provider,state,automatic_replies_enabled')
    .eq('workspace_id', 'vital-decor').eq('platform', 'instagram')
    .eq('state', 'connected').eq('automatic_replies_enabled', true)
    .in('external_account_id', uniqueAccounts);
  if (error) throw error;
  const byAccount = new Map((rows || []).filter((row) => row.access_token && row.external_account_id !== GUI_INSTAGRAM_ID
      && String(row.username || '').replace(/^@/, '').toLowerCase() === 'vitaldecor_')
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
    if (!await claimDelivery(db, event)) continue;
    try {
      try {
        await sendMetaMessage(connection, event.senderId, {
          attachment: { type: 'template', payload: {
            template_type: 'button',
            text: VITAL_WELCOME_TEXT,
            buttons: [
              { type: 'web_url', url: VITAL_STORE_LINK, title: 'Comprar no site' },
              { type: 'web_url', url: VITAL_WHATSAPP_LINK, title: 'Falar no WhatsApp' },
            ],
          } },
        });
      } catch (templateError) {
        if (!templateError?.templateRejected) throw templateError;
        console.warn('Vital Instagram: template rejected, sending text with link.');
        await sendMetaMessage(connection, event.senderId, { text: VITAL_WELCOME_TEXT + '\n\nWhatsApp: ' + VITAL_WHATSAPP_LINK });
      }
      await updateDelivery(db, event, 'sent');
      sent += 1;
    } catch {
      // An uncertain response must never trigger a second automatic send.
      await updateDelivery(db, event, 'failed', 'Meta did not confirm Direct delivery');
      console.error('VITAL:IG:DIRECT: delivery not confirmed');
    }
  }
  return sent;
}

