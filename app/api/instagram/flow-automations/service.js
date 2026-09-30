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
  if (depth > MAX_DEPTH) {
    return {
      id: crypto.randomUUID(),
      text: '',
      audioPath: '',
      audioName: '',
      audioBucket: AUDIO_BUCKET,
      responseMode: 'same',
      sharedNext: null,
      buttons: [],
    };
  }

  const buttons = Array.isArray(node?.buttons) ? node.buttons.slice(0, MAX_BUTTONS) : [];
  const responseMode = node?.responseMode === 'personalized' ? 'personalized' : 'same';
  const sanitizedButtons = buttons.map((button) => ({
    id: String(button?.id || crypto.randomUUID()).slice(0, 80),
    label: String(button?.label || '').trim().slice(0, 20),
    next: sanitizeNode(button?.next || {}, depth + 1),
  })).filter((button) => button.label);

  const legacyShared = responseMode === 'same' ? buttons[0]?.next : null;
  const sharedSource = node?.sharedNext || legacyShared;

  return {
    id: String(node?.id || crypto.randomUUID()).slice(0, 80),
    text: String(node?.text || '').trim().slice(0, 1000),
    audioPath: String(node?.audioPath || '').trim().slice(0, 500),
    audioName: String(node?.audioName || '').trim().slice(0, 120),
    audioBucket: String(node?.audioBucket || AUDIO_BUCKET).trim().slice(0, 120),
    responseMode,
    sharedNext: responseMode === 'same' && sharedSource
      ? sanitizeNode(sharedSource, depth + 1)
      : null,
    buttons: sanitizedButtons,
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

export async function loadOwnerFlows(db, userId) {
  const { data, error } = await db.from('instagram_flow_automations')
    .select('flows,updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw flowError('Não foi possível carregar as automações.', 503);

  if (data) {
    return {
      row: data,
      flows: sanitizeFlows(data.flows || []),
    };
  }

  // O workspace do TidePlace usa uma única conta do Instagram. Se a sessão
  // autenticada mudou, reaproveita o último conjunto persistido em vez de
  // mostrar apenas o fallback local da interface.
  const { data: latest, error: latestError } = await db.from('instagram_flow_automations')
    .select('flows,updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) throw flowError('Não foi possível carregar as automações.', 503);

  const flows = sanitizeFlows(latest?.flows || []);

  if (latest && flows.length) {
    await db.from('instagram_flow_automations').upsert({
      user_id: userId,
      flows,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  }

  return {
    row: latest || null,
    flows,
  };
}

export async function saveOwnerFlows(db, userId, value) {
  const flows = sanitizeFlows(value);
  const updatedAt = new Date().toISOString();

  const { error } = await db.from('instagram_flow_automations')
    .upsert({
      user_id: userId,
      flows,
      updated_at: updatedAt,
    }, { onConflict: 'user_id' });

  if (error) throw flowError('Não foi possível salvar as automações.', 503);

  return { flows, updatedAt };
}

export async function loadLatestFlows(db) {
  const { data, error } = await db.from('instagram_flow_automations')
    .select('flows')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return [];
  return sanitizeFlows(data.flows || []);
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

async function sendAudio(db, accountId, recipientId, audioPath, audioBucket = AUDIO_BUCKET) {
  if (!audioPath) return null;
  const bucket = String(audioBucket || AUDIO_BUCKET).trim() || AUDIO_BUCKET;
  const { data, error } = await db.storage.from(bucket).createSignedUrl(audioPath, 600);
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

function buttonTemplate(flow, node, { includeAudioAction = false } = {}) {
  const buttons = (node?.buttons || []).slice(0, 3).map((button) => ({
    type: 'postback',
    title: button.label,
    payload: buttonPayload(flow.id, button.id),
  }));

  if (includeAudioAction && node?.audioPath) {
    buttons.unshift({
      type: 'postback',
      title: 'Ouvir áudio',
      payload: buttonPayload(flow.id, '__audio__'),
    });
  }

  if (!buttons.length || buttons.length > 3) return null;

  return {
    attachment: {
      type: 'template',
      payload: {
        template_type: 'button',
        text: node?.text || 'Escolha uma opção:',
        buttons,
      },
    },
  };
}

async function sendNodeToRecipient(db, accountId, recipientId, flow, node, { includeAudio = true } = {}) {
  if (includeAudio && node?.audioPath) await sendAudio(db, accountId, recipientId, node.audioPath, node.audioBucket);

  const template = (node?.buttons || []).length <= 3 ? buttonTemplate(flow, node) : null;
  if (template) {
    return metaPost(accountId + '/messages', {
      recipient: { id: recipientId },
      message: template,
    });
  }

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

function findButtonContext(node, buttonId, depth = 0) {
  if (!node || depth > MAX_DEPTH) return null;

  for (const button of node.buttons || []) {
    if (button.id === buttonId) return { button, parentNode: node };
  }

  if (node.responseMode === 'same' && node.sharedNext) {
    const sharedMatch = findButtonContext(node.sharedNext, buttonId, depth + 1);
    if (sharedMatch) return sharedMatch;
  }

  if (node.responseMode === 'personalized') {
    for (const button of node.buttons || []) {
      const nested = findButtonContext(button.next, buttonId, depth + 1);
      if (nested) return nested;
    }
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
    media_id: String(event?.value?.media?.id || event?.value?.media_id || ''),
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

    // Prioriza a resposta pública. Assim, mesmo se o envio do Direct
    // demorar, a confirmação visível no comentário é processada primeiro.
    if (publicReply) {
      const mediaId = String(event?.value?.media?.id || event?.value?.media_id || '');
      try {
        const publicMessage = username
          ? '@' + username.replace(/^@/, '') + ' ' + publicReply
          : publicReply;

        // O endpoint de reply encadeado estava aceitando a chamada e devolvendo
        // um ID, mas a resposta não aparecia no Instagram. Para garantir
        // visibilidade, publicamos a resposta no próprio post com @menção ao
        // autor do comentário.
        const createdReply = mediaId
          ? await metaPost(mediaId + '/comments', { message: publicMessage })
          : await metaPost(commentId + '/replies', { message: publicMessage });

        const publicReplyId = String(createdReply?.id || '');

        await updateEvent(db, eventId, {
          public_status: 'sent',
          public_reply_id: publicReplyId || null,
          public_delivery_mode: mediaId ? 'top_level_mention' : 'threaded_mention_fallback',
          public_error: null,
        });
      } catch (error) {
        await updateEvent(db, eventId, {
          public_status: 'failed',
          public_error: String(error?.message || '').slice(0, 300),
          public_delivery_mode: mediaId ? 'top_level_mention' : 'threaded_mention_fallback',
        });
      }
    } else {
      await updateEvent(db, eventId, { public_status: 'skipped' });
    }

    try {
      const startTemplate = (flow.start?.buttons || []).length <= 3
        ? buttonTemplate(flow, flow.start, { includeAudioAction: true })
        : null;
      const startReplies = startTemplate ? [] : quickReplies(flow, flow.start, { includeAudioAction: true });
      await metaPost(event.accountId + '/messages', {
        recipient: { comment_id: commentId },
        message: startTemplate || {
          text: flow.start.text || (flow.start.audioPath ? 'Toque abaixo para continuar e ouvir o áudio.' : 'Escolha uma opção:'),
          ...(startReplies.length ? { quick_replies: startReplies } : {}),
        },
      });
      await updateEvent(db, eventId, { private_status: 'sent' });
    } catch (error) {
      await updateEvent(db, eventId, { private_status: 'failed', private_error: String(error?.message || '').slice(0, 300) });
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
      await sendAudio(db, event.accountId, event.senderId, flow.start.audioPath, flow.start.audioBucket);

      if (flow.start.sharedNext) {
        await sendNodeToRecipient(db, event.accountId, event.senderId, flow, flow.start.sharedNext);
        handled += 1;
        continue;
      }

      const branchTemplate = (flow.start?.buttons || []).length <= 3 ? buttonTemplate(flow, flow.start) : null;
      const branchReplies = branchTemplate ? [] : quickReplies(flow, flow.start);
      if (branchTemplate || branchReplies.length) {
        await metaPost(event.accountId + '/messages', {
          recipient: { id: event.senderId },
          message: branchTemplate || {
            text: flow.start.text || 'Agora escolha como você quer continuar:',
            quick_replies: branchReplies,
          },
        });
      }
      handled += 1;
      continue;
    }

    const context = findButtonContext(flow.start, event.buttonId);
    if (!context) continue;

    await db.from('instagram_flow_responses').insert({
      flow_id: flow.id,
      flow_name: flow.name,
      sender_id: event.senderId,
      button_id: context.button.id,
      button_label: context.button.label,
      parent_node_id: context.parentNode.id,
    });

    const nextNode = context.parentNode.responseMode === 'personalized'
      ? context.button.next
      : context.parentNode.sharedNext;

    if (nextNode) {
      await sendNodeToRecipient(db, event.accountId, event.senderId, flow, nextNode);
    }
    handled += 1;
  }
  return handled;
}
