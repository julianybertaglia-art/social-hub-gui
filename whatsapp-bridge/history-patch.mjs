import fs from 'node:fs';

const file = './server.js';
let src = fs.readFileSync(file, 'utf8');

function replaceOnce(search, replacement, label) {
  if (!src.includes(search)) {
    throw new Error(`History patch failed: pattern not found (${label})`);
  }
  src = src.replace(search, replacement);
}

replaceOnce(
  "const LOG_LEVEL = process.env.LOG_LEVEL || 'warn';\n",
  "const LOG_LEVEL = process.env.LOG_LEVEL || 'warn';\nconst HISTORY_SINCE = Date.parse(process.env.HISTORY_SINCE || '2026-07-01T00:00:00-03:00');\n",
  'history since'
);

replaceOnce(
  "    chatId: remoteJid,\n    senderId,",
  "    chatId: remoteJid,\n    contactId: remoteJid,\n    senderId,",
  'contact id'
);

replaceOnce(
  "async function deliverWebhook(message) {",
  "async function deliverWebhook(message, event = 'message') {",
  'webhook signature'
);

replaceOnce(
  "        event: 'message',\n        message,",
  "        event,\n        message,",
  'webhook event'
);

replaceOnce(
  "    const normalized = normalizedMessage(message);\n    if (!normalized || normalized.fromMe) continue;\n    await deliverWebhook(normalized);",
  "    const normalized = normalizedMessage(message);\n    if (!normalized) continue;\n    await deliverWebhook(normalized);",
  'capture outbound messages'
);

replaceOnce(
  "async function handleMessageBatch(messages, generation) {\n  if (generation !== socketGeneration) return;\n\n  for (const message of messages || []) {\n    rememberMessage(message);\n    const normalized = normalizedMessage(message);\n    if (!normalized) continue;\n    await deliverWebhook(normalized);\n  }\n}\n",
  "async function handleMessageBatch(messages, generation) {\n  if (generation !== socketGeneration) return;\n\n  for (const message of messages || []) {\n    rememberMessage(message);\n    const normalized = normalizedMessage(message);\n    if (!normalized) continue;\n    await deliverWebhook(normalized);\n  }\n}\n\nasync function handleHistorySet(history, generation) {\n  if (generation !== socketGeneration) return;\n\n  const normalized = (history?.messages || [])\n    .map((message) => ({ rawMessage: message, normalized: normalizedMessage(message) }))\n    .filter(({ normalized: item }) => {\n      if (!item || item.isGroup) return false;\n      const ts = Date.parse(item.timestamp || '');\n      return !Number.isFinite(HISTORY_SINCE) || !Number.isFinite(ts) || ts >= HISTORY_SINCE;\n    })\n    .sort((left, right) => Date.parse(left.normalized.timestamp) - Date.parse(right.normalized.timestamp));\n\n  logger.warn({ count: normalized.length }, 'Histórico do WhatsApp recebido para importar no Lynna.');\n\n  for (const { rawMessage, normalized: item } of normalized) {\n    if (generation !== socketGeneration) return;\n    rememberMessage(rawMessage);\n    await deliverWebhook(item, 'history');\n  }\n\n  logger.warn({ count: normalized.length }, 'Importação do lote de histórico concluída.');\n}\n",
  'history handler'
);

replaceOnce(
  "    syncFullHistory: false,\n    getMessage,",
  "    syncFullHistory: true,\n    shouldSyncHistoryMessage: () => true,\n    getMessage,",
  'full history config'
);

replaceOnce(
  "  nextSocket.ev.on('messages.upsert', ({ messages }) => {\n    handleMessageBatch(messages, generation).catch((error) => {\n      lastError = error.message;\n      logger.warn({ err: error }, 'Falha ao processar mensagem recebida.');\n    });\n  });\n",
  "  nextSocket.ev.on('messages.upsert', ({ messages }) => {\n    handleMessageBatch(messages, generation).catch((error) => {\n      lastError = error.message;\n      logger.warn({ err: error }, 'Falha ao processar mensagem recebida.');\n    });\n  });\n  nextSocket.ev.on('messaging-history.set', (history) => {\n    handleHistorySet(history, generation).catch((error) => {\n      lastError = error.message;\n      logger.warn({ err: error }, 'Falha ao importar histórico do WhatsApp.');\n    });\n  });\n",
  'history event listener'
);

fs.writeFileSync(file, src, 'utf8');
console.log('Lynna history-sync patch applied.');
