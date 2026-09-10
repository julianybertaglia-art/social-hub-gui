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
  "    chatId: remoteJid,\n    contactId: remoteJid.endsWith('@lid') && message?.key?.remoteJidAlt ? message.key.remoteJidAlt : remoteJid,\n    senderId,",
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
  "    if (!response.ok) {\n      logger.warn({ status: response.status }, 'O webhook do Lynna recusou a mensagem.');\n    }",
  "    if (!response.ok) {\n      const responseText = await response.text().catch(() => '');\n      logger.warn({ status: response.status, responseText: responseText.slice(0, 500), event }, 'O webhook do Lynna recusou a mensagem.');\n    }",
  'webhook error details'
);

replaceOnce(
  "    const normalized = normalizedMessage(message);\n    if (!normalized || normalized.fromMe) continue;\n    await deliverWebhook(normalized);",
  "    const normalized = normalizedMessage(message);\n    if (!normalized) continue;\n    await deliverWebhook(normalized);",
  'capture outbound messages'
);

replaceOnce(
  "async function handleMessageBatch(messages, generation) {\n  if (generation !== socketGeneration) return;\n\n  for (const message of messages || []) {\n    rememberMessage(message);\n    const normalized = normalizedMessage(message);\n    if (!normalized) continue;\n    await deliverWebhook(normalized);\n  }\n}\n",
  "async function handleMessageBatch(messages, generation) {\n  if (generation !== socketGeneration) return;\n\n  for (const message of messages || []) {\n    rememberMessage(message);\n    const normalized = normalizedMessage(message);\n    if (!normalized) continue;\n    await deliverWebhook(normalized);\n  }\n}\n\nasync function handleHistorySet(history, generation) {\n  if (generation !== socketGeneration) return;\n\n  const rawMessages = history?.messages || [];\n  logger.warn({\n    rawCount: rawMessages.length,\n    chats: history?.chats?.length || 0,\n    contacts: history?.contacts?.length || 0,\n    syncType: history?.syncType ?? null,\n    progress: history?.progress ?? null,\n    isLatest: history?.isLatest ?? null,\n  }, 'Lote de histórico do WhatsApp recebido.');\n\n  const normalized = rawMessages\n    .map((message) => ({ rawMessage: message, normalized: normalizedMessage(message) }))\n    .filter(({ normalized: item }) => {\n      if (!item || item.isGroup) return false;\n      const ts = Date.parse(item.timestamp || '');\n      return !Number.isFinite(HISTORY_SINCE) || !Number.isFinite(ts) || ts >= HISTORY_SINCE;\n    })\n    .sort((left, right) => Date.parse(left.normalized.timestamp) - Date.parse(right.normalized.timestamp));\n\n  logger.warn({ count: normalized.length }, 'Histórico do WhatsApp filtrado para importar no Lynna.');\n\n  let imported = 0;\n  let failed = 0;\n  for (const { rawMessage, normalized: item } of normalized) {\n    if (generation !== socketGeneration) return;\n    rememberMessage(rawMessage);\n    try {\n      await deliverWebhook(item, 'history');\n      imported += 1;\n    } catch (error) {\n      failed += 1;\n      logger.warn({ err: error, messageId: item.id }, 'Falha ao enviar item histórico ao Lynna.');\n    }\n  }\n\n  logger.warn({ count: normalized.length, imported, failed }, 'Importação do lote de histórico concluída.');\n}\n",
  'history handler'
);

replaceOnce(
  "    syncFullHistory: false,\n    getMessage,",
  "    syncFullHistory: true,\n    shouldSyncHistoryMessage: () => true,\n    getMessage,",
  'full history config'
);

replaceOnce(
  "  nextSocket.ev.on('creds.update', auth.saveCreds);",
  "  nextSocket.ev.on('creds.update', () => {\n    if (generation !== socketGeneration || socket !== nextSocket) return;\n    Promise.resolve(auth.saveCreds()).catch((error) => {\n      logger.warn({ err: error }, 'Falha ao persistir credenciais do WhatsApp.');\n    });\n  });",
  'guard credential writes'
);

replaceOnce(
  "  nextSocket.ev.on('messages.upsert', ({ messages }) => {\n    handleMessageBatch(messages, generation).catch((error) => {\n      lastError = error.message;\n      logger.warn({ err: error }, 'Falha ao processar mensagem recebida.');\n    });\n  });\n",
  "  nextSocket.ev.on('messages.upsert', ({ messages }) => {\n    handleMessageBatch(messages, generation).catch((error) => {\n      lastError = error.message;\n      logger.warn({ err: error }, 'Falha ao processar mensagem recebida.');\n    });\n  });\n  nextSocket.ev.on('messaging-history.set', (history) => {\n    handleHistorySet(history, generation).catch((error) => {\n      lastError = error.message;\n      logger.warn({ err: error }, 'Falha ao importar histórico do WhatsApp.');\n    });\n  });\n",
  'history event listener'
);

replaceOnce(
  "  if (activeSocket) {\n    try {\n      await activeSocket.logout();\n    } catch (error) {\n      logger.warn({ err: error }, 'O logout do WhatsApp retornou um erro; limpando a sessão local.');\n    }\n  }\n\n  await fs.rm(AUTH_DIR, { recursive: true, force: true }).catch(() => {});",
  "  if (activeSocket) {\n    try {\n      activeSocket.ev?.removeAllListeners?.('creds.update');\n    } catch {}\n    try {\n      await activeSocket.logout();\n    } catch (error) {\n      logger.warn({ err: error }, 'O logout do WhatsApp retornou um erro; limpando a sessão local.');\n    }\n    try {\n      activeSocket.ws?.close();\n    } catch {}\n  }\n\n  await new Promise((resolve) => setTimeout(resolve, 350));\n  await fs.rm(AUTH_DIR, { recursive: true, force: true }).catch(() => {});",
  'safe relink cleanup'
);

fs.writeFileSync(file, src, 'utf8');
console.log('Lynna history-sync patch applied.');
