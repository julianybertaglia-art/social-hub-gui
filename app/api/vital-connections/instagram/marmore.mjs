// Vital Decor Instagram comment-to-DM. This handler never touches Gui's account or WhatsApp.
import { GUI_INSTAGRAM_ID } from '../helpers.mjs';

const KEYWORD = 'MARMORE';
const RULE_ID = 'vital-marmore-comment-link-v1';
const API_VERSION = 'v26.0';
const MAX_COMMENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Links to real, existing Vital Decor marble products. No guessed search/category URL.
export const MARMORE_REPLY_TEXT = [
  'Oi! 💜 Aqui estão os adesivos de mármore da Vital Decor que você pediu:',
  '',
  '🤍 Carrara branco 60x60:',
  'https://vitaldecor.com.br/produtos/placa-adesiva-marmore-branco-carrara-60x60cm-vsoc7',
  '',
  '🖤 Mármore preto 60x60:',
  'https://vitaldecor.com.br/produtos/placa-adesiva-marmore-preto-60x60cm-autocolante-1kddz',
  '',
  '✨ Calacata Gold 60x60:',
  'https://vitaldecor.com.br/produtos/placa-adesiva-marmore-calacata-gold-60x60cm-3viup',
  '',
  'É só acessar o modelo que você mais gostou para conferir e comprar! 😊',
].join('\n');

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}
function matchesKeyword(text) {
  return normalize(text).split(/[^A-Z0-9]+/).includes(KEYWORD);
}

export function extractVitalMarmoreComments(payload, now = Date.now()) {
  if (payload?.object !== 'instagram' || !Array.isArray(payload.entry)) return [];
  const found = new Set();
  const result = [];
  for (const entry of payload.entry) {
    const accountId = String(entry?.id || '');
    if (!/^\d{5,40}$/.test(accountId) || accountId === GUI_INSTAGRAM_ID) continue;
    const changes = [
      ...(Array.isArray(entry?.changes) ? entry.changes : []),
      ...(entry?.field === 'comments' && entry?.value ? [{ field: 'comments', value: entry.value }] : []),
    ];
    for (const change of changes) {
      if (change?.field !== 'comments') continue;
      const value = change.value || {};
      const commentId = String(value.id || value.comment_id || '');
      const username = String(value?.from?.username || '').replace(/^@/, '').toLowerCase();
      if (!/^\d{5,50}$/.test(commentId) || value?.from?.id === accountId
        || username === 'vitaldecor_' || !matchesKeyword(value.text)) continue;
      const eventTime = Number(value.timestamp || entry.time || 0);
      const milliseconds = eventTime > 1e12 ? eventTime : eventTime * 1000;
      if (eventTime && (milliseconds < now - MAX_COMMENT_AGE_MS || milliseconds > now + 5 * 60 * 1000)) continue;
      const key = accountId + ':' + commentId;
      if (found.has(key)) continue;
      found.add(key);
      result.push({ accountId, commentId, username, commentText: String(value.text).slice(0, 1000) });
    }
  }
  return result;
}

async function sendPrivateReply(connection, commentId) {
  const response = await fetch((connection.auth_provider === 'instagram_login' ? 'https://graph.instagram.com/' : 'https://graph.facebook.com/') + API_VERSION + '/' + connection.external_account_id + '/messages', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + connection.access_token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      message: { text: MARMORE_REPLY_TEXT },
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error || !payload.message_id) {
    throw new Error('Meta private reply HTTP ' + response.status + ' / ' + (payload.error?.code || 'unconfirmed'));
  }
  return payload.message_id;
}

export async function processVitalMarmoreComments(payload, db) {
  const events = extractVitalMarmoreComments(payload);
  if (!events.length) return 0;

  // The Vital token is stored server-side; no fallback to the Gui's token.
  const accountIds = [...new Set(events.map((event) => event.accountId))];
  const { data: connections, error: connectionError } = await db.from('workspace_meta_connections')
    .select('external_account_id,access_token,username,auth_provider')
    .eq('workspace_id', 'vital-decor').eq('platform', 'instagram').eq('state', 'connected')
    .in('external_account_id', accountIds);
  if (connectionError) throw connectionError;
  const validConnections = new Map((connections || [])
    .filter((connection) => connection.access_token
      && String(connection.username || '').replace(/^@/, '').toLowerCase() === 'vitaldecor_'
      && connection.external_account_id !== GUI_INSTAGRAM_ID)
    .map((connection) => [String(connection.external_account_id), connection]));

  let sent = 0;
  for (const event of events) {
    const connection = validConnections.get(event.accountId);
    if (!connection) continue;
    // The Meta private-reply API permits one DM per comment. Don't replay failed or
    // unconfirmed sends, and don't interfere with the Gui's comment ledger entries.
    const { data: existing, error: lookupError } = await db.from('instagram_automation_events')
      .select('id').eq('comment_id', event.commentId).eq('matched_rule_id', RULE_ID)
      .limit(1).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) continue;
    const { data: receipt, error: claimError } = await db.from('instagram_automation_events')
      .insert({
        comment_id: event.commentId,
        username: event.username,
        comment_text: event.commentText,
        matched_rule_id: RULE_ID,
        matched_keyword: KEYWORD,
        private_status: 'processing',
        public_status: 'skipped',
      })
      .select('id').single();
    if (claimError || !receipt) throw claimError || new Error('Instagram comment receipt not confirmed');
    try {
      await sendPrivateReply(connection, event.commentId);
      await db.from('instagram_automation_events').update({ private_status: 'sent' }).eq('id', receipt.id);
      sent += 1;
    } catch (error) {
      await db.from('instagram_automation_events').update({
        private_status: 'failed',
        private_error: String(error?.message || 'Meta did not confirm sending').slice(0, 250),
      }).eq('id', receipt.id);
      console.error('VITAL:MARMORE: private reply not confirmed', { receiptId: receipt.id });
    }
  }
  return sent;
}
