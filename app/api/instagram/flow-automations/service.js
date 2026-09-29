import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const FLOW_STORAGE_KEY = 'tideplace-instagram-flow-automations';
export const STATE_TITLE = '__SOCIAL_HUB_STATE__';
export const AUDIO_BUCKET = 'instagram-flow-audio';
const API_VERSION = 'v26.0';
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const MAX_DEPTH = 4;
const MAX_BUTTONS = 13;

function flowError(message, status = 500) {
  return Object.assign(new Error(message), { status });
}

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

function cleanBase64(value) {
  return String(value || '').replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '');
}

function sanitizeNode(node, depth = 0) {
  if (depth > MAX_DEPTH) return { id: crypto.randomUUID(), text: '', audioPath: '', audioName: '', buttons: [] };
  const buttons = Array.isArray(node?.buttons) ? node.buttons.slice(0, MAX_BUTTONS) : [];
  return {
    id: String(node?.id || crypto.randomUUID()).slice(0, 80),
    text: String(node?.text || '').trim().slice(0, 1000),
    audioPath: String(node?.audioPath || '').trim().slice(0, 500),
    audioName: String(node?.audioName || '').trim().slice(0, 120),
    buttons: buttons.map((button) => ({
      id: String(button?.id || crypto.randomUUID()).slice(0, 80),
      label: String(button?.label || '').trim().slice(0, 20),
      next: sanitizeNode(button?.next || {}, depth + 1),
    })).filter((button) => button.label),
  };
}

export function sanitizeFlows(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).map((flow, index) => {
    const publicReplies = Array.isArray(flow?.publicReplies) ? flow.publicReplies : [];
    const start = sanitizeNode(flow?.start || {});
    const keyword = String(flow?.keyword || '').trim().toUpperCase().slice(0, 50);
    return {
      id: String(flow?.id || crypto.randomUUID()).slice(0, 80),
      name: String(flow?.name || ('Automação ' + (index + 1))).trim().slice(0, 100),
      keyword,
      publicReplies: [
        String(publicReplies[0] || '').trim().slice(0, 300),
        String(publicReplies[1] || '').trim().slice(0, 300),
      ],
      start,
      active: Boolean(flow?.active && keyword && (start.text || start.audioPath)),
    };
  });
}

function parseState(description) {
  try { return JSON.parse(description || '{}'); } catch { return {}; }
}

function flowsFromState(description) {
  const state = parseState(description);
  const raw = state?.data?.[FLOW_STORAGE_KEY];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return sanitizeFlows(parsed);
  } catch {
    return [];
  }
}

export async function loadOwnerFlows(db, userId) {
  const { data: rows, error } = await db.from('content_items')
    .select('id,description,updated_at')
    .eq('title', STATE_TITLE)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1);
  const row = rows?.[0];
  if (error || !row?.id) throw flowError('Estado da TidePlace não encontrado.', 503);
  return { row, flows: flowsFromState(row.description) };
}

export async function saveOwnerFlows(db, userId, value) {
  const flows = sanitizeFlows(value);
  const { row } = await loadOwnerFlows(db, userId);
  const state = parseState(row.description);
  const updatedAt = Date.now();
  const description = JSON.stringify({
    ...state,
    updatedAt,
    data: {
      ...(state?.data && typeof state.data === 'object' ? state.data : {}),
      [FLOW_STORAGE_KEY]: JSON.stringify(flows),
    },
  });

  const { error } = await db.from('content_items')
    .update({ description, status: 'Ativo' })
    .eq('id', row.id)
    .eq('user_id', userId);
  if (error) throw flowError('Não foi possível salvar as automações.', 503);
  return { flows, updatedAt };
}

export async function loadLatestFlows(db) {
  const { data, error } = await db.from('content_items')
    .select('description')
    .eq('title', STATE_TITLE)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.description) return [];
  return flowsFromState(data.description);
}

export async function uploadFlowAudio(db, userId, rawBase64, fileName = 'audio.m4a') {
  const bytes = Buffer.from(cleanBase64(rawBase64), 'base64');
  const looksM4a = bytes.length >= 16
    && bytes.subarray(4, 8).toString('ascii') === 'ftyp'
    && ['M4A ', 'isom', 'mp42'].includes(bytes.subarray(8, 12).toString('ascii'));
  if (!looksM4a || !bytes.length || bytes.length > MAX_AUDIO_BYTES) {
    throw flowError('Use um áudio M4A/AAC de até 2 MB.', 422);
  }

  const { data: bucket, error: bucketError } = await db.storage.getBucket(AUDIO_BUCKET);
  if (bucketError) {
    if (!['400', '404'].includes(String(bucketError.statusCode))) throw flowError('Não foi possível acessar o armazenamento de áudio.', 503);
    const { error } = await db.storage.createBucket(AUDIO_BUCKET, {
      public: false,
      allowedMimeTypes: ['audio/mp4'],
      fileSizeLimit: MAX_AUDIO_BYTES,
    });
    if (error) throw flowError('Não foi possível preparar o armazenamento de áudio.', 503);
  } else if (bucket?.public) {
    throw flowError('O armazenamento de áudio precisa permanecer privado.', 503);
  }

  const path = userId + '/' + crypto.randomUUID() + '.m4a';
  const { error } = await db.storage.from(AUDIO_BUCKET).upload(path, bytes, {
    contentType: 'audio/mp4',
    upsert: false,
  });
  if (error) throw flowError('Não foi possível salvar o áudio.', 503);
  return { audioPath: path, audioName: String(fileName || 'audio.m4a').slice(0, 120) };
}

async function metaPost(path, body) {
  const token = process.env.META_INSTAGRAM_ACCESS_TOKEN;
  if (!token) throw flowError('Instagram não configurado para automações.', 503);
  const response = await fetch('https://graph.instagram.com/' + API_VERSION + '/' + path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.error) throw flowError(result?.error?.message || ('Erro Meta HTTP ' + response.status), 502);
  return result;
}

async function sendAudio(db, accountId, recipientId, audioPath) {
  if (!audioPath) return null;
  const { data, error } = await db.storage.from(AUDIO_BUCKET).createSignedUrl(audioPath, 600);
  if (error || !data?.signedUrl) throw flowError('Não foi possível preparar o áudio da automação.', 503);
  return metaPost(accountId + '/messages', {
    recipient: { id: recipientId },
    message: { attachment: { type: 'audio', payload: { url: data.signedUrl } } },
  });
}

function buttonPayload(flowId, buttonId) {
  return ('TPF:' + flowId + ':' + buttonId).slice(0, 1000);
}

function quickReplies(flow, node, { includeAudioAction = false } = {}) {
  const replies = (node?.buttons || []).slice(0, MAX_BUTTONS).map((button) => ({
    content_type: 'text',
    title: button.label,
    payload: buttonPayload(flow.id, button.id),
  }));

  if (includeAudioAction && node?.audioPath) {
    replies.unshift({
      content_type: 'text',
      title: 'Ouvir áudio',
      payload: buttonPayload(flow.id, '__audio__'),
    });
  }

  return replies.slice(0, MAX_BUTTONS);
}

async function sendNodeToRecipient(db, accountId, recipientId, flow, node, { includeAudio = true } = {}) {
  if (includeAudio && node?.audioPath) await sendAudio(db, accountId, recipientId, node.audioPath);
  const replies = quickReplies(flow, node);
  if (!node?.text && !replies.length) return null;
  return metaPost(accountId + '/messages', {
    recipient: { id: recipientId },
    message: {
      text: node?.text || 'Escolha uma opção:',
      ...(replies.length ? { quick_replies: replies } : {}),
    },
  });
}

function findButton(node, buttonId, depth = 0) {
  if (!node || depth > MAX_DEPTH) return null;
  for (const button of node.buttons || []) {
    if (button.id === buttonId) return button;
    const nested = findButton(button.next, buttonId, depth + 1);
    if (nested) return nested;
  }
  return null;
}

function parsePayload(value) {
  const match = String(value || '').match(/^TPF:([^:]+):([^:]+)$/);
  return match ? { flowId: match[1], buttonId: match[2] } : null;
}

function extractCommentEvents(payload) {
  if (!Array.isArray(payload?.entry)) return [];
  return payload.entry.flatMap((entry) => {
    if (entry?.field === 'comments' && entry?.value) return [{ accountId: String(entry.id || ''), value: entry.value }];
    if (!Array.isArray(entry?.changes)) return [];
    return entry.changes.filter((change) => change?.field === 'comments' && change?.value)
      .map((change) => ({ accountId: String(entry.id || ''), value: change.value }));
  });
}

function extractSelectionEvents(payload) {
  if (payload?.object !== 'instagram' || !Array.isArray(payload.entry)) return [];
  return payload.entry.flatMap((entry) => (Array.isArray(entry?.messaging) ? entry.messaging : []).flatMap((event) => {
    const message = event?.message || {};
    const payloadValue = String(message?.quick_reply?.payload || event?.postback?.payload || '');
    const parsed = parsePayload(payloadValue);
    const senderId = String(event?.sender?.id || '');
    const accountId = String(entry?.id || '');
    if (!parsed || !/^\d+$/.test(senderId) || !/^\d+$/.test(accountId) || senderId === accountId || message?.is_echo) return [];
    return [{ ...parsed, senderId, accountId }];
  }));
}

async function claimEvent(db, event, flow) {
  const { data } = await db.from('instagram_automation_events').insert({
    comment_id: String(event?.value?.id || ''),
    username: String(event?.value?.from?.username || ''),
    comment_text: String(event?.value?.text || ''),
    matched_rule_id: flow.id,
    matched_keyword: flow.keyword,
    private_status: 'processing',
    public_status: 'processing',
  }).select('id').maybeSingle();
  return Number(data?.id || 0);
}

async function updateEvent(db, id, values) {
  if (!id) return;
  await db.from('instagram_automation_events').update(values).eq('id', id);
}

export async function processFlowComments(payload, db = null) {
  const events = extractCommentEvents(payload);
  if (!events.length) return 0;
  db ||= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const flows = (await loadLatestFlows(db)).filter((flow) => flow.active);
  let handled = 0;

  for (const event of events) {
    const commentId = String(event?.value?.id || '');
    const text = String(event?.value?.text || '');
    const username = String(event?.value?.from?.username || '');
    if (!commentId || !event.accountId || username.toLowerCase() === 'gui_nonato') continue;
    const normalized = normalizeText(text);
    const flow = flows.find((item) => item.keyword && normalized.includes(normalizeText(item.keyword)));
    if (!flow) continue;

    const eventId = await claimEvent(db, event, flow);
    const replies = flow.publicReplies.filter(Boolean);
    const publicReply = replies.length ? replies[(Math.max(1, eventId) - 1) % replies.length] : '';

    try {
      const startReplies = quickReplies(flow, flow.start, { includeAudioAction: true });
      await metaPost(event.accountId + '/messages', {
        recipient: { comment_id: commentId },
        message: {
          text: flow.start.text || (flow.start.audioPath ? 'Toque abaixo para continuar e ouvir o áudio.' : 'Escolha uma opção:'),
          ...(startReplies.length ? { quick_replies: startReplies } : {}),
        },
      });
      await updateEvent(db, eventId, { private_status: 'sent' });
    } catch (error) {
      await updateEvent(db, eventId, { private_status: 'failed', private_error: String(error?.message || '').slice(0, 300) });
    }

    if (publicReply) {
      try {
        await metaPost(commentId + '/replies', { message: publicReply });
        await updateEvent(db, eventId, { public_status: 'sent' });
      } catch (error) {
        await updateEvent(db, eventId, { public_status: 'failed', public_error: String(error?.message || '').slice(0, 300) });
      }
    } else {
      await updateEvent(db, eventId, { public_status: 'skipped' });
    }
    handled += 1;
  }
  return handled;
}

export async function processFlowSelections(payload, db = null) {
  const events = extractSelectionEvents(payload);
  if (!events.length) return 0;
  db ||= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const flows = (await loadLatestFlows(db)).filter((flow) => flow.active);
  let handled = 0;

  for (const event of events) {
    const flow = flows.find((item) => item.id === event.flowId);
    if (!flow) continue;

    if (event.buttonId === '__audio__' && flow.start.audioPath) {
      await sendAudio(db, event.accountId, event.senderId, flow.start.audioPath);
      const branchReplies = quickReplies(flow, flow.start);
      if (branchReplies.length) {
        await metaPost(event.accountId + '/messages', {
          recipient: { id: event.senderId },
          message: {
            text: flow.start.text || 'Agora escolha como você quer continuar:',
            quick_replies: branchReplies,
          },
        });
      }
      handled += 1;
      continue;
    }

    const button = findButton(flow.start, event.buttonId);
    if (!button) continue;
    await sendNodeToRecipient(db, event.accountId, event.senderId, flow, button.next);
    handled += 1;
  }
  return handled;
}
