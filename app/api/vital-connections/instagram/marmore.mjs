// Vital Decor Instagram comment-to-DM. This handler never touches Gui's account or WhatsApp.
import { GUI_INSTAGRAM_ID } from '../helpers.mjs';
import { MARMORE_PUBLIC_REPLY, MARMORE_REPLY_TEXT } from '../../../lib/vital-marmore-copy.mjs';
import { JARDIM_PUBLIC_REPLY, JARDIM_REPLY_TEXT } from '../../../lib/vital-jardim-copy.mjs';

export { MARMORE_PUBLIC_REPLY, MARMORE_REPLY_TEXT };

const MARMORE_RULE = { keyword: 'MARMORE', id: 'vital-marmore-comment-link-v1', reply: MARMORE_REPLY_TEXT, publicReply: MARMORE_PUBLIC_REPLY };
const JARDIM_RULE = { keyword: 'JARDIM', id: 'vital-jardim-comment-link-v1', reply: JARDIM_REPLY_TEXT, publicReply: JARDIM_PUBLIC_REPLY };
const API_VERSION = 'v26.0';
const MAX_COMMENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}
function matchesKeyword(text, keyword) {
  return normalize(text).split(/[^A-Z0-9]+/).includes(keyword);
}

function extractVitalComments(payload, keyword, now = Date.now()) {
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
        || username === 'vitaldecor_' || !matchesKeyword(value.text, keyword)) continue;
      // Meta allows only one private reply per comment. Preserve the existing
      // marble rule when a single comment mentions both keywords.
      if (keyword === 'JARDIM' && matchesKeyword(value.text, 'MARMORE')) continue;
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

export function extractVitalMarmoreComments(payload, now = Date.now()) {
  return extractVitalComments(payload, MARMORE_RULE.keyword, now);
}

export function extractVitalJardimComments(payload, now = Date.now()) {
  return extractVitalComments(payload, JARDIM_RULE.keyword, now);
}

async function sendPrivateReply(connection, commentId, replyText) {
  const response = await fetch((connection.auth_provider === 'instagram_login' ? 'https://graph.instagram.com/' : 'https://graph.facebook.com/') + API_VERSION + '/' + connection.external_account_id + '/messages', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + connection.access_token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      message: { text: replyText },
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error || typeof payload.message_id !== 'string' || !payload.message_id.trim()) {
    throw new Error('Meta private reply HTTP ' + response.status + ' / ' + (payload.error?.code || 'unconfirmed'));
  }
  return payload.message_id;
}

async function sendPublicReply(connection, commentId, publicReply) {
  const origin = connection.auth_provider === 'instagram_login'
    ? 'https://graph.instagram.com/' : 'https://graph.facebook.com/';
  const response = await fetch(origin + API_VERSION + '/' + commentId + '/replies', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + connection.access_token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: publicReply }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    const rejected = response.status >= 400 && response.status < 500
      && response.status !== 408 && response.status !== 429;
    throw Object.assign(new Error('Meta did not confirm public reply'), { rejected });
  }
  if (typeof payload.id !== 'string' || !payload.id.trim()) {
    throw new Error('Meta did not return a public reply ID');
  }
  return payload.id;
}

// A single insert, backed by a unique comment_id, is the cross-instance claim.
// If Meta's response is uncertain, keep the receipt and never replay blindly.
async function claimComment(db, connection, event) {
  const { data, error } = await db.from('vital_instagram_comment_deliveries')
    .insert({
      connection_id: connection.id,
      workspace_id: 'vital-decor',
      account_id: event.accountId,
      comment_id: event.commentId,
      status: 'processing',
    }).select('comment_id').maybeSingle();
  if (error?.code === '23505') return false;
  if (error || !data) throw new Error('Vital comment receipt could not be recorded');
  return true;
}

async function saveCommentReceipt(db, event, values) {
  const { data, error } = await db.from('vital_instagram_comment_deliveries')
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('workspace_id', 'vital-decor').eq('account_id', event.accountId)
    .eq('comment_id', event.commentId).select('comment_id').maybeSingle();
  return !error && Boolean(data);
}

async function processVitalComments(payload, db, rule) {
  const events = extractVitalComments(payload, rule.keyword);
  if (!events.length) return 0;

  // The Vital token is stored server-side; no fallback to the Gui's token.
  const accountIds = [...new Set(events.map((event) => event.accountId))];
  const { data: connections, error: connectionError } = await db.from('workspace_meta_connections')
    .select('id,external_account_id,access_token,username,auth_provider')
    .eq('workspace_id', 'vital-decor').eq('platform', 'instagram').eq('state', 'connected')
    .in('external_account_id', accountIds);
  if (connectionError) throw connectionError;
  const validConnections = new Map((connections || [])
    .filter((connection) => connection.id && connection.access_token
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
      .select('id').eq('comment_id', event.commentId).eq('matched_rule_id', rule.id)
      .limit(1).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) continue;
    if (!await claimComment(db, connection, event)) continue;
    const { data: receipt, error: claimError } = await db.from('instagram_automation_events')
      .insert({
        comment_id: event.commentId,
        username: event.username,
        comment_text: event.commentText,
        matched_rule_id: rule.id,
        matched_keyword: rule.keyword,
        private_status: 'processing',
        public_status: 'skipped',
      })
      .select('id').single();
    if (claimError || !receipt) {
      await saveCommentReceipt(db, event, { status: 'failed' });
      throw claimError || new Error('Instagram comment receipt not confirmed');
    }
    let messageId;
    try {
      messageId = await sendPrivateReply(connection, event.commentId, rule.reply);
    } catch (error) {
      if (!await saveCommentReceipt(db, event, { status: 'failed' }).catch(() => false)) {
        console.error('VITAL:' + rule.keyword + ': failed message receipt could not be saved');
      }
      await db.from('instagram_automation_events').update({
        private_status: 'failed',
        private_error: String(error?.message || 'Meta did not confirm sending').slice(0, 250),
      }).eq('id', receipt.id);
      console.error('VITAL:' + rule.keyword + ': private reply not confirmed', { receiptId: receipt.id });
      continue;
    }
    const saved = await saveCommentReceipt(db, event, { status: 'sent', meta_message_id: messageId })
      .catch(() => false);
    if (!saved) {
      await db.from('instagram_automation_events').update({
        private_status: 'unverified', private_error: 'Confirmed by Meta but receipt could not be saved',
      }).eq('id', receipt.id);
      console.error('VITAL:' + rule.keyword + ': confirmed message receipt could not be saved');
      continue;
    }
    const { error: updateError } = await db.from('instagram_automation_events')
      .update({ private_status: 'sent' }).eq('id', receipt.id);
    if (updateError) console.error('VITAL:' + rule.keyword + ': event status could not be saved');
    // Only promise a DM publicly after the private message is confirmed and
    // durably recorded. The comment claim also prevents replay on webhook retry.
    try {
      const publicReplyId = await sendPublicReply(connection, event.commentId, rule.publicReply);
      const { error: publicError } = await db.from('instagram_automation_events').update({
        public_status: 'sent', public_reply_id: publicReplyId,
        public_delivery_mode: 'threaded_reply', public_error: null,
      }).eq('id', receipt.id);
      if (publicError) console.error('VITAL:' + rule.keyword + ': public reply status could not be saved');
    } catch (error) {
      await db.from('instagram_automation_events').update({
        public_status: error?.rejected ? 'failed' : 'unverified',
        public_delivery_mode: 'threaded_reply',
        public_error: 'Meta did not confirm public reply',
      }).eq('id', receipt.id);
      console.error('VITAL:' + rule.keyword + ': public reply not confirmed');
    }
    sent += 1;
  }
  return sent;
}

export function processVitalMarmoreComments(payload, db) {
  return processVitalComments(payload, db, MARMORE_RULE);
}

export function processVitalJardimComments(payload, db) {
  return processVitalComments(payload, db, JARDIM_RULE);
}



