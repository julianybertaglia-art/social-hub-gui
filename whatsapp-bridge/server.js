import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import makeWASocket, {
  BufferJSON,
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';

const PORT = Number(process.env.PORT || 3000);
const AUTH_DIR = process.env.AUTH_DIR || '/data/auth';
const MESSAGE_CACHE_FILE = process.env.MESSAGE_CACHE_FILE || '/data/message-cache.json';
const MESSAGE_CACHE_TTL_MS = Number(process.env.MESSAGE_CACHE_TTL_MS || 15 * 60 * 1000);
const BRIDGE_API_TOKEN = String(process.env.BRIDGE_API_TOKEN || '');
const BRIDGE_WEBHOOK_URL = String(process.env.BRIDGE_WEBHOOK_URL || '');
const BRIDGE_WEBHOOK_TOKEN = String(process.env.BRIDGE_WEBHOOK_TOKEN || '');
const AUTO_CONNECT = String(process.env.AUTO_CONNECT || 'true').toLowerCase() !== 'false';
const LOG_LEVEL = process.env.LOG_LEVEL || 'warn';
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const RECONNECT_BACKOFF_MS = [2000, 5000, 10000, 30000];

const logger = pino({ level: LOG_LEVEL });
const recentMessages = new Map();
let cacheWritePromise = Promise.resolve();

let socket = null;
let socketGeneration = 0;
let connectionState = 'disconnected';
let currentQrDataUrl = null;
let account = null;
let lastError = null;
let reconnectAttempt = 0;
let reconnectTimer = null;
let connectPromise = null;

function nowIso() {
  return new Date().toISOString();
}

function errorWithCode(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function publicStatus() {
  return {
    ok: true,
    state: connectionState,
    connected: connectionState === 'connected',
    hasQr: Boolean(currentQrDataUrl),
    qrDataUrl: currentQrDataUrl,
    account,
    reconnectAttempt,
    lastError,
  };
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

async function ensureStorage() {
  await fs.mkdir(AUTH_DIR, { recursive: true });
  await fs.mkdir(path.dirname(MESSAGE_CACHE_FILE), { recursive: true });
}

function pruneMessageCache() {
  const cutoff = Date.now();
  for (const [id, entry] of recentMessages.entries()) {
    if (!entry || entry.expiresAt <= cutoff) recentMessages.delete(id);
  }
}

async function loadMessageCache() {
  await ensureStorage();
  const raw = await fs.readFile(MESSAGE_CACHE_FILE, 'utf8').catch(() => '');
  if (!raw) return;

  try {
    const entries = JSON.parse(raw, BufferJSON.reviver);
    if (!Array.isArray(entries)) return;

    for (const item of entries) {
      const id = item?.[0];
      const entry = item?.[1];
      if (id && entry?.message && Number(entry.expiresAt) > Date.now()) {
        recentMessages.set(id, entry);
      }
    }
  } catch (error) {
    logger.warn({ err: error }, 'Não foi possível carregar o cache recente de mensagens.');
  }
}

function persistMessageCache() {
  pruneMessageCache();
  const snapshot = Array.from(recentMessages.entries());
  cacheWritePromise = cacheWritePromise
    .catch(() => {})
    .then(async () => {
      await ensureStorage();
      await fs.writeFile(
        MESSAGE_CACHE_FILE,
        JSON.stringify(snapshot, BufferJSON.replacer),
        'utf8'
      );
    })
    .catch((error) => {
      logger.warn({ err: error }, 'Não foi possível persistir o cache de mensagens.');
    });
}

function rememberMessage(message) {
  const id = message?.key?.id;
  if (!id || !message?.message) return;

  recentMessages.set(id, {
    message: message.message,
    expiresAt: Date.now() + MESSAGE_CACHE_TTL_MS,
  });
  persistMessageCache();
}

async function getMessage(key) {
  const id = key?.id;
  if (!id) return undefined;

  const entry = recentMessages.get(id);
  if (!entry || entry.expiresAt <= Date.now()) {
    recentMessages.delete(id);
    return undefined;
  }

  return entry.message;
}

function unwrapMessageContent(content) {
  let current = content || {};

  for (let index = 0; index < 5; index += 1) {
    const wrapperKey = [
      'ephemeralMessage',
      'viewOnceMessage',
      'viewOnceMessageV2',
      'documentWithCaptionMessage',
    ].find((key) => current?.[key]);

    if (!wrapperKey) break;
    current = current[wrapperKey]?.message || current[wrapperKey] || {};
  }

  return current;
}

function messageType(content) {
  if (content?.conversation || content?.extendedTextMessage) return 'text';
  if (content?.imageMessage) return 'image';
  if (content?.videoMessage) return 'video';
  if (content?.audioMessage) return 'audio';
  if (content?.documentMessage) return 'document';
  if (content?.stickerMessage) return 'sticker';
  if (content?.locationMessage || content?.liveLocationMessage) return 'location';
  if (content?.contactMessage || content?.contactsArrayMessage) return 'contacts';
  if (
    content?.buttonsResponseMessage ||
    content?.listResponseMessage ||
    content?.templateButtonReplyMessage
  ) return 'interactive';
  return 'unknown';
}

function messageText(content) {
  return (
    content?.conversation ||
    content?.extendedTextMessage?.text ||
    content?.imageMessage?.caption ||
    content?.videoMessage?.caption ||
    content?.documentMessage?.caption ||
    content?.buttonsResponseMessage?.selectedDisplayText ||
    content?.listResponseMessage?.title ||
    content?.templateButtonReplyMessage?.selectedDisplayText ||
    ''
  );
}

function numberFromJid(jid) {
  const value = String(jid || '');
  return value.split('@')[0].split(':')[0].replace(/\D/g, '');
}

function toJid(value) {
  const raw = String(value || '').trim();
  if (!raw) throw errorWithCode('Destinatário é obrigatório.', 'INVALID_RECIPIENT');
  if (raw.includes('@')) return raw;

  const digits = raw.replace(/\D/g, '');
  if (!digits) throw errorWithCode('Destinatário inválido.', 'INVALID_RECIPIENT');
  return digits + '@s.whatsapp.net';
}

function accountFromUser(user) {
  if (!user) return null;

  return {
    id: user.id || null,
    name: user.name || null,
    phone: numberFromJid(user.id),
  };
}

function normalizedMessage(message) {
  const remoteJid = message?.key?.remoteJid;
  if (!remoteJid || remoteJid === 'status@broadcast') return null;

  const content = unwrapMessageContent(message.message);
  const type = messageType(content);
  const timestampSeconds = Number(message.messageTimestamp || 0);
  const timestamp = Number.isFinite(timestampSeconds) && timestampSeconds > 0
    ? new Date(timestampSeconds * 1000).toISOString()
    : nowIso();
  const fromMe = Boolean(message.key?.fromMe);
  const senderId = fromMe
    ? (socket?.user?.id || remoteJid)
    : (message.key?.participant || remoteJid);

  return {
    id: message.key?.id || randomUUID(),
    chatId: remoteJid,
    senderId,
    senderName: message.pushName || null,
    timestamp,
    type,
    text: messageText(content),
    fromMe,
    isGroup: remoteJid.endsWith('@g.us'),
    raw: {
      key: message.key || null,
      pushName: message.pushName || null,
      messageTimestamp: timestampSeconds || null,
    },
  };
}

async function deliverWebhook(message) {
  if (!BRIDGE_WEBHOOK_URL) return;

  try {
    const response = await fetch(BRIDGE_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + BRIDGE_WEBHOOK_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event: 'message',
        message,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, 'O webhook do Lynna recusou a mensagem.');
    }
  } catch (error) {
    logger.warn({ err: error }, 'Falha ao entregar mensagem ao Lynna.');
  }
}

async function handleMessageBatch(messages, generation) {
  if (generation !== socketGeneration) return;

  for (const message of messages || []) {
    rememberMessage(message);
    const normalized = normalizedMessage(message);
    if (!normalized || normalized.fromMe) continue;
    await deliverWebhook(normalized);
  }
}

function scheduleReconnect(delayOverride) {
  clearReconnectTimer();

  const delay = Number.isFinite(delayOverride)
    ? delayOverride
    : RECONNECT_BACKOFF_MS[Math.min(reconnectAttempt, RECONNECT_BACKOFF_MS.length - 1)];

  reconnectAttempt += 1;
  connectionState = 'reconnecting';

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectBridge().catch((error) => {
      lastError = error.message;
      logger.warn({ err: error }, 'Tentativa de reconexão falhou.');
    });
  }, delay);
}

async function handleConnectionUpdate(update, generation, nextSocket) {
  if (generation !== socketGeneration) return;

  const { connection, lastDisconnect, qr } = update;

  if (qr) {
    currentQrDataUrl = await QRCode.toDataURL(qr, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: 'M',
    });
    connectionState = 'awaiting_qr';
    lastError = null;
  }

  if (connection === 'open') {
    connectionState = 'connected';
    currentQrDataUrl = null;
    reconnectAttempt = 0;
    lastError = null;
    account = accountFromUser(nextSocket.user);
    logger.info({ account }, 'WhatsApp conectado.');
    return;
  }

  if (connection !== 'close') return;

  if (socket === nextSocket) socket = null;

  const statusCode = lastDisconnect?.error?.output?.statusCode
    || lastDisconnect?.error?.statusCode
    || null;
  const loggedOut = statusCode === DisconnectReason.loggedOut
    || statusCode === DisconnectReason.badSession;

  if (loggedOut) {
    await fs.rm(AUTH_DIR, { recursive: true, force: true }).catch(() => {});
    currentQrDataUrl = null;
    account = null;
    reconnectAttempt = 0;
    connectionState = 'reconnecting';
    scheduleReconnect(1000);
    logger.warn({ statusCode }, 'Sessão invalidada; um novo QR será gerado.');
    return;
  }

  connectionState = 'reconnecting';
  scheduleReconnect();
  logger.warn({ statusCode }, 'Conexão encerrada; reconectando.');
}

async function startSocket() {
  const generation = ++socketGeneration;
  connectionState = 'starting';
  currentQrDataUrl = null;
  lastError = null;
  clearReconnectTimer();
  await ensureStorage();

  const auth = await useMultiFileAuthState(AUTH_DIR);
  let version;
  try {
    const latest = await fetchLatestBaileysVersion();
    version = latest?.version;
  } catch (error) {
    logger.warn({ err: error }, 'Não foi possível consultar a versão mais recente do WhatsApp.');
  }

  const nextSocket = makeWASocket({
    ...(version ? { version } : {}),
    auth: {
      creds: auth.state.creds,
      keys: makeCacheableSignalKeyStore(auth.state.keys, logger),
    },
    logger,
    browser: Browsers.macOS('Desktop'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    getMessage,
  });

  socket = nextSocket;
  connectionState = 'connecting';

  nextSocket.ev.on('creds.update', auth.saveCreds);
  nextSocket.ev.on('connection.update', (update) => {
    handleConnectionUpdate(update, generation, nextSocket).catch((error) => {
      lastError = error.message;
      logger.warn({ err: error }, 'Falha ao atualizar estado da conexão.');
    });
  });
  nextSocket.ev.on('messages.upsert', ({ messages }) => {
    handleMessageBatch(messages, generation).catch((error) => {
      lastError = error.message;
      logger.warn({ err: error }, 'Falha ao processar mensagem recebida.');
    });
  });

  return publicStatus();
}

async function connectBridge() {
  if (socket && connectionState !== 'disconnected' && connectionState !== 'error') {
    return publicStatus();
  }

  if (connectPromise) return connectPromise;

  connectPromise = startSocket()
    .catch((error) => {
      socket = null;
      connectionState = 'error';
      lastError = error.message;
      scheduleReconnect();
      throw error;
    })
    .finally(() => {
      connectPromise = null;
    });

  return connectPromise;
}

async function disconnectBridge() {
  socketGeneration += 1;
  clearReconnectTimer();
  reconnectAttempt = 0;
  const activeSocket = socket;
  socket = null;

  if (activeSocket) {
    try {
      await activeSocket.logout();
    } catch (error) {
      logger.warn({ err: error }, 'O logout do WhatsApp retornou um erro; limpando a sessão local.');
    }
  }

  await fs.rm(AUTH_DIR, { recursive: true, force: true }).catch(() => {});
  currentQrDataUrl = null;
  account = null;
  lastError = null;
  connectionState = 'disconnected';
  return publicStatus();
}

function requireConnectedSocket() {
  if (!socket || connectionState !== 'connected') {
    throw errorWithCode('WhatsApp ainda não está conectado.', 'BRIDGE_NOT_CONNECTED');
  }
  return socket;
}

async function sendText(body) {
  const target = toJid(body?.to);
  const text = String(body?.text || '').trim();
  if (!text) throw errorWithCode('Texto da mensagem é obrigatório.', 'INVALID_MESSAGE');

  const activeSocket = requireConnectedSocket();
  const sent = await activeSocket.sendMessage(target, { text });
  rememberMessage(sent);
  return {
    ok: true,
    messageId: sent?.key?.id || null,
    jid: target,
    type: 'text',
  };
}

async function downloadMedia(urlValue) {
  let url;
  try {
    url = new URL(String(urlValue || ''));
  } catch {
    throw errorWithCode('URL da mídia inválida.', 'INVALID_MEDIA_URL');
  }

  if (url.protocol !== 'https:') {
    throw errorWithCode('A URL da mídia precisa usar HTTPS.', 'INVALID_MEDIA_URL');
  }

  const response = await fetch(url.href, {
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    throw errorWithCode('Não foi possível baixar a mídia.', 'MEDIA_DOWNLOAD_FAILED');
  }

  const length = Number(response.headers.get('content-length') || 0);
  if (length > 16 * 1024 * 1024) {
    throw errorWithCode('A mídia excede 16 MB.', 'MEDIA_TOO_LARGE');
  }

  return Buffer.from(await response.arrayBuffer());
}

async function sendAudio(body) {
  const target = toJid(body?.to);
  const audio = await downloadMedia(body?.audioUrl);
  const activeSocket = requireConnectedSocket();
  const sent = await activeSocket.sendMessage(target, {
    audio,
    mimetype: String(body?.mimetype || 'audio/ogg; codecs=opus'),
    ptt: body?.ptt !== false,
  });
  rememberMessage(sent);

  return {
    ok: true,
    messageId: sent?.key?.id || null,
    jid: target,
    type: 'audio',
  };
}

async function sendMedia(body) {
  const target = toJid(body?.to);
  const type = String(body?.type || 'image').toLowerCase();
  const allowedTypes = ['image', 'video', 'document'];
  if (!allowedTypes.includes(type)) {
    throw errorWithCode('Tipo de mídia inválido.', 'INVALID_MEDIA_TYPE');
  }

  const media = await downloadMedia(body?.mediaUrl);
  const activeSocket = requireConnectedSocket();
  const payload = {
    [type]: media,
    mimetype: String(body?.mimetype || 'application/octet-stream'),
  };

  if (body?.caption) payload.caption = String(body.caption);
  if (type === 'document' && body?.fileName) payload.fileName = String(body.fileName);

  const sent = await activeSocket.sendMessage(target, payload);
  rememberMessage(sent);

  return {
    ok: true,
    messageId: sent?.key?.id || null,
    jid: target,
    type,
  };
}

async function listGroups() {
  const activeSocket = requireConnectedSocket();
  const groups = await activeSocket.groupFetchAllParticipating();

  return Object.values(groups || {})
    .map((group) => ({
      jid: group.id,
      name: group.subject || 'Grupo sem nome',
      description: group.desc || null,
      participants: Array.isArray(group.participants) ? group.participants.length : 0,
      owner: group.owner || null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
}

function authorized(request) {
  if (!BRIDGE_API_TOKEN) return false;
  const header = String(request.headers.authorization || '');
  return header === 'Bearer ' + BRIDGE_API_TOKEN;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw errorWithCode('Corpo da requisição muito grande.', 'REQUEST_TOO_LARGE');
    }
    chunks.push(chunk);
  }

  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw errorWithCode('JSON inválido.', 'INVALID_JSON');
  }
}

function responseStatus(error) {
  if (error?.code === 'BRIDGE_NOT_CONNECTED') return 409;
  if (error?.code === 'INVALID_RECIPIENT' || error?.code === 'INVALID_MESSAGE') return 400;
  if (error?.code === 'INVALID_MEDIA_URL' || error?.code === 'INVALID_MEDIA_TYPE') return 400;
  if (error?.code === 'MEDIA_TOO_LARGE' || error?.code === 'REQUEST_TOO_LARGE') return 413;
  return 500;
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  response.end(JSON.stringify(payload));
}

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url || '/', 'http://localhost');
  const route = requestUrl.pathname;

  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {});
    return;
  }

  if (route === '/health') {
    sendJson(response, 200, {
      ok: true,
      service: 'whatsapp-bridge',
      state: connectionState,
    });
    return;
  }

  if (!authorized(request)) {
    sendJson(response, 401, { ok: false, error: 'Não autorizado.' });
    return;
  }

  try {
    if (request.method === 'GET' && route === '/status') {
      sendJson(response, 200, publicStatus());
      return;
    }

    if (request.method === 'GET' && route === '/qrcode') {
      sendJson(response, 200, publicStatus());
      return;
    }

    if (request.method === 'POST' && route === '/connect') {
      sendJson(response, 200, await connectBridge());
      return;
    }

    if (request.method === 'POST' && route === '/disconnect') {
      sendJson(response, 200, await disconnectBridge());
      return;
    }

    if (request.method === 'POST' && route === '/relink') {
      await disconnectBridge();
      sendJson(response, 200, await connectBridge());
      return;
    }

    if (request.method === 'GET' && route === '/groups') {
      sendJson(response, 200, { ok: true, groups: await listGroups() });
      return;
    }

    if (request.method === 'POST' && route === '/messages/text') {
      sendJson(response, 200, await sendText(await readJson(request)));
      return;
    }

    if (request.method === 'POST' && route === '/messages/audio') {
      sendJson(response, 200, await sendAudio(await readJson(request)));
      return;
    }

    if (request.method === 'POST' && route === '/messages/media') {
      sendJson(response, 200, await sendMedia(await readJson(request)));
      return;
    }

    sendJson(response, 404, { ok: false, error: 'Rota não encontrada.' });
  } catch (error) {
    logger.warn({ err: error, route }, 'Falha ao processar requisição da ponte.');
    sendJson(response, responseStatus(error), {
      ok: false,
      code: error?.code || 'BRIDGE_ERROR',
      error: error instanceof Error ? error.message : 'Falha na ponte do WhatsApp.',
    });
  }
}

if (!BRIDGE_API_TOKEN) {
  logger.warn('BRIDGE_API_TOKEN não configurado; todas as rotas protegidas ficarão indisponíveis.');
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    logger.error({ err: error }, 'Erro inesperado no servidor HTTP.');
    sendJson(response, 500, { ok: false, error: 'Erro interno da ponte.' });
  });
});

await loadMessageCache();

server.listen(PORT, () => {
  logger.info({ port: PORT }, 'WhatsApp Bridge iniciado.');
});

if (AUTO_CONNECT) {
  connectBridge().catch((error) => {
    logger.warn({ err: error }, 'Conexão automática inicial não foi concluída.');
  });
}

async function shutdown() {
  clearReconnectTimer();
  socketGeneration += 1;
  try {
    socket?.ws?.close();
  } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
