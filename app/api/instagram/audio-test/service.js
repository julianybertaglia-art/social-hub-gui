import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const TABLE = 'instagram_audio_tests';
const BUCKET = 'instagram-audio-tests';
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const MENTORIA_AUDIO_TEST_ID = '9edc7844-3f0a-4bb6-b71a-e2e7cb7d2331';
const MENTORIA_AUTOMATION_SLUGS = ['mentoria-audio-comment', 'mentoria-audio-direct'];
const STATUS_FIELDS = 'id,label,duration_seconds,keyword,status,prepared_at,expires_at,sent_at,error_message,visual_result';

export function testError(message, status = 500) {
  return Object.assign(new Error(message), { status });
}

export function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw testError('A conexão do Hub com o banco precisa ser configurada.', 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function authorizedOwner(request, db) {
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) throw testError('Entre no Hub para acessar o teste.', 401);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user?.id) throw testError('Sua sessão expirou. Entre novamente no Hub.', 401);
  const { data: state, error: stateError } = await db.from('content_items')
    .select('id').eq('title', '__SOCIAL_HUB_STATE__').eq('user_id', data.user.id).maybeSingle();
  if (stateError) throw testError('Não foi possível verificar seu acesso. Tente novamente.', 503);
  if (!state) throw testError('Esta conta não tem acesso ao teste do Gui.', 403);
  return data.user.id;
}

export async function latestTest(db, userId) {
  const { data, error } = await db.from(TABLE).select(STATUS_FIELDS)
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw testError('Não foi possível carregar o teste. Tente novamente.', 503);
  return data;
}

export function safeMetaDetail(error, token = '') {
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
  if (!token) throw testError('A conexão do Instagram precisa ser configurada no Hub.', 503);
  const response = await fetch(`https://graph.instagram.com/v26.0/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.error) {
    const code = Number(result?.error?.code);
    const subcode = Number(result?.error?.error_subcode);
    const detail = safeMetaDetail(result?.error, token);
    const diagnostic = Number.isFinite(code) ? ` (código ${code}${Number.isFinite(subcode) ? `/${subcode}` : ''})` : '';
    throw testError(`O Instagram recusou a solicitação${diagnostic}.${detail ? ` ${detail}` : ' Confira a conexão do Instagram no Hub.'}`, 502);
  }
  return result;
}

function cleanBase64(value) {
  return String(value || '')
    .replace(/^data:[^;]+;base64,/i, '')
    .replace(/\s/g, '');
}

function assertM4aBase64(audioBase64) {
  const bytes = Buffer.from(cleanBase64(audioBase64), 'base64');
  const m4a = bytes.length >= 16 && bytes.subarray(4, 8).toString('ascii') === 'ftyp'
    && ['M4A ', 'isom', 'mp42'].includes(bytes.subarray(8, 12).toString('ascii'));
  if (!m4a || bytes.length > MAX_AUDIO_BYTES) {
    throw testError('O áudio precisa estar em M4A com áudio AAC e ter até 2 MB.', 422);
  }
  return bytes.toString('base64');
}

export async function saveAudioDraft(db, userId, body) {
  const purpose = String(body?.purpose || '').trim().toLowerCase();
  const isMentoria = purpose === 'mentoria';
  const label = String(body?.label || (isMentoria ? 'MENTORIA — áudio oficial' : 'Áudio do Gui')).trim().slice(0, 90);
  const audioBase64 = assertM4aBase64(body?.audioBase64 || body?.audio_base64);
  const duration = Math.max(1, Number(body?.durationSeconds || body?.duration_seconds || 1));
  const id = isMentoria ? MENTORIA_AUDIO_TEST_ID : crypto.randomUUID();

  await db.from(TABLE).delete().eq('id', id).eq('user_id', userId);

  const { data, error } = await db.from(TABLE).insert({
    id,
    user_id: userId,
    label,
    duration_seconds: duration,
    audio_base64: audioBase64,
    audio_path: null,
    keyword: null,
    status: 'draft',
    error_message: null,
    prepared_at: null,
    expires_at: null,
    sent_at: null,
    sent_message_id: null,
    recipient_id: null,
    incoming_message_id: null,
    visual_result: null,
    updated_at: new Date().toISOString(),
  }).select(STATUS_FIELDS).maybeSingle();

  if (error || !data) throw testError('Não foi possível salvar o áudio no Hub.', 503);
  return data;
}

async function preparePrivateAudio(db, test) {
  // Instagram Login's Send API lists AAC/M4A/WAV/MP4 for audio, not MP3.
  // https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api
  if (test.audio_path?.endsWith('.m4a')) return test.audio_path;
  const bytes = Buffer.from(test.audio_base64 || '', 'base64');
  const m4a = bytes.length >= 16 && bytes.subarray(4, 8).toString('ascii') === 'ftyp'
    && ['M4A ', 'isom', 'mp42'].includes(bytes.subarray(8, 12).toString('ascii'));
  if (!m4a || bytes.length > MAX_AUDIO_BYTES) {
    throw testError('O áudio do teste precisa estar em M4A com áudio AAC e ter até 2 MB.', 422);
  }
  const { data: bucket, error: bucketError } = await db.storage.getBucket(BUCKET);
  if (bucketError) {
    if (!['400', '404'].includes(String(bucketError.statusCode))) throw testError('Não foi possível acessar o áudio privado.', 503);
    const { error } = await db.storage.createBucket(BUCKET, {
      public: false, allowedMimeTypes: ['audio/mp4'], fileSizeLimit: MAX_AUDIO_BYTES,
    });
    if (error) throw testError('Não foi possível preparar o armazenamento do áudio.', 503);
  } else if (bucket?.public) {
    throw testError('O armazenamento do teste precisa ser privado.', 503);
  } else if (!bucket?.allowed_mime_types?.includes('audio/mp4')) {
    const { error } = await db.storage.updateBucket(BUCKET, {
      public: false, allowedMimeTypes: ['audio/mp4'], fileSizeLimit: MAX_AUDIO_BYTES,
    });
    if (error) throw testError('Não foi possível preparar o armazenamento para M4A.', 503);
  }
  const path = `${test.user_id}/${test.id}.m4a`;
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: 'audio/mp4', upsert: true });
  if (error) throw testError('Não foi possível guardar o áudio. Tente novamente.', 503);
  return path;
}

async function activateMentoriaAutomations(db, userId, accountId, audioPath, now) {
  const { error } = await db.from('instagram_audio_automations').update({
    active: true,
    ig_account_id: accountId,
    audio_path: audioPath,
    updated_at: now.toISOString(),
  }).eq('user_id', userId).in('slug', MENTORIA_AUTOMATION_SLUGS);

  if (error) throw testError('O áudio foi preparado, mas não consegui ativar a automação da Mentoria.', 503);
}

export async function prepareTest(db, userId, id) {
  if (!process.env.META_APP_SECRET) throw testError('A conexão de mensagens do Instagram precisa ser configurada.', 503);
  const { data: test, error } = await db.from(TABLE)
    .update({ status: 'preparing', updated_at: new Date().toISOString(), error_message: null })
    .eq('id', id).eq('user_id', userId).in('status', ['draft', 'prepare_failed'])
    .select('*').maybeSingle();
  if (error) throw testError('Não foi possível iniciar o teste.', 503);
  if (!test) throw testError('O teste já foi preparado ou encerrado. Atualize o resultado.', 409);
  try {
    const profile = await metaRequest('me?fields=user_id,username');
    const accountId = String(profile.user_id || profile.id || '');
    if (String(profile.username || '').toLowerCase() !== 'gui_nonato' || !/^\d+$/.test(accountId)) {
      throw testError('A conta conectada precisa ser @gui_nonato.', 403);
    }
    const subscriptions = await metaRequest(`${accountId}/subscribed_apps`);
    if (!Array.isArray(subscriptions.data)) throw testError('Não foi possível verificar o recebimento de mensagens.', 502);
    // Preserve all existing fields when adding the Direct message subscription.
    const fields = new Set(subscriptions.data.flatMap((app) => app.subscribed_fields || []));
    fields.add('comments');
    fields.add('messages');
    fields.add('messaging_postbacks');
    const subscription = await metaRequest(`${accountId}/subscribed_apps`, { subscribed_fields: [...fields].join(',') });
    if (subscription.success !== true) throw testError('O Instagram não confirmou o recebimento de mensagens.', 502);
    const path = await preparePrivateAudio(db, test);
    const now = new Date();
    const { error: saveError } = await db.from(TABLE).update({
      status: 'ready', audio_path: path, audio_base64: null, ig_account_id: accountId,
      keyword: `GUIAUDIO${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
      prepared_at: now.toISOString(), expires_at: new Date(now.getTime() + 48 * 3600000).toISOString(),
      updated_at: now.toISOString(),
    }).eq('id', id).eq('user_id', userId).eq('status', 'preparing');
    if (saveError) throw testError('Não foi possível salvar o teste preparado.', 503);

    if (String(test.id) === MENTORIA_AUDIO_TEST_ID || String(test.label || '').toUpperCase().includes('MENTORIA')) {
      await activateMentoriaAutomations(db, userId, accountId, path, now);
    }
  } catch (error) {
    await db.from(TABLE).update({ status: 'prepare_failed', error_message: error.status ? error.message : 'A preparação não terminou. Tente novamente.', updated_at: new Date().toISOString() })
      .eq('id', id).eq('user_id', userId).eq('status', 'preparing');
    throw error;
  }
}

export function extractTestMessages(payload, now = Date.now()) {
  if (payload?.object !== 'instagram' || !Array.isArray(payload.entry)) return [];
  return payload.entry.flatMap((entry) => (Array.isArray(entry?.messaging) ? entry.messaging : []).flatMap((event) => {
    const message = event?.message;
    const sender = String(event?.sender?.id || '');
    const account = String(entry?.id || '');
    const timestamp = Number(event?.timestamp);
    const keyword = String(message?.text || '').trim().toUpperCase();
    if (!/^GUIAUDIO[A-F0-9]{10}$/.test(keyword) || !message?.mid || message.is_echo || message.is_deleted
      || !/^\d+$/.test(sender) || !/^\d+$/.test(account) || sender === account
      || String(event?.recipient?.id || '') !== account || !Number.isFinite(timestamp)
      || timestamp < now - 23 * 3600000 || timestamp > now + 5 * 60000) return [];
    return [{ accountId: account, senderId: sender, messageId: message.mid, keyword, timestamp }];
  }));
}

export async function sendTestReply(db, event) {
  if (!/^\d+$/.test(String(event?.senderId || ''))) return false;
  const now = new Date();
  // One atomic claim prevents repeated deliveries across webhook retries/workers.
  const { data: test, error } = await db.from(TABLE).update({
    status: 'sending', recipient_id: event.senderId, incoming_message_id: event.messageId, updated_at: now.toISOString(),
  }).eq('keyword', event.keyword).eq('ig_account_id', event.accountId).eq('status', 'ready')
    .or(`recipient_id.is.null,recipient_id.eq.${event.senderId}`)
    .gt('expires_at', now.toISOString()).lte('prepared_at', new Date(event.timestamp).toISOString())
    .select('id,user_id,audio_path,audio_base64').maybeSingle();
  if (error) throw testError('Não foi possível verificar o teste de áudio.', 503);
  if (!test) return false;
  try {
    const path = await preparePrivateAudio(db, test);
    if (path !== test.audio_path || test.audio_base64) {
      const { error: audioError } = await db.from(TABLE).update({ audio_path: path, audio_base64: null })
        .eq('id', test.id).eq('status', 'sending');
      if (audioError) throw testError('Não foi possível registrar o áudio preparado.', 503);
    }
    const { data: media, error: mediaError } = await db.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (mediaError || !media?.signedUrl) throw testError('Não foi possível preparar o áudio para o Instagram.', 503);
    const result = await metaRequest(`${event.accountId}/messages`, {
      recipient: { id: event.senderId },
      message: { attachment: { type: 'audio', payload: { url: media.signedUrl } } },
    });
    if (!result.message_id) throw testError('O Instagram não confirmou o envio. Confira seu Direct antes de repetir.', 502);
    const { error: saveError } = await db.from(TABLE).update({
      status: 'sent', sent_message_id: result.message_id, sent_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', test.id).eq('status', 'sending');
    if (saveError) throw testError('O áudio foi enviado, mas o registro não foi atualizado. Confira o Direct.', 503);
  } catch (error) {
    // Never retry automatically: a timeout may happen after Meta accepted the audio.
    await db.from(TABLE).update({
      status: 'send_failed', error_message: error.status ? error.message : 'O envio não foi confirmado. Confira o Direct antes de repetir.', updated_at: new Date().toISOString(),
    }).eq('id', test.id).eq('status', 'sending');
    console.error('Teste de áudio: envio não confirmado.', { testId: test.id });
  }
  return true;
}

export async function processAudioTests(payload) {
  const events = extractTestMessages(payload);
  if (!events.length) return;
  const db = serverClient();
  for (const event of events) await sendTestReply(db, event);
}