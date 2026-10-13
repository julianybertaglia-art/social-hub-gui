export const WHATSAPP_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function mostRecentInboundAt(messages = []) {
  let latest = null;
  for (const message of messages) {
    if (message?.direction !== 'inbound') continue;
    const timestamp = Date.parse(message.sent_at);
    if (Number.isFinite(timestamp) && (latest === null || timestamp > latest)) latest = timestamp;
  }
  return latest === null ? null : new Date(latest).toISOString();
}

export function isWhatsAppServiceWindowOpen(lastInboundAt, nowMs = Date.now()) {
  const ms = Date.parse(lastInboundAt || '');
  return Number.isFinite(ms) && ms <= nowMs && nowMs - ms < WHATSAPP_SERVICE_WINDOW_MS;
}

export function isSimpleApprovedWhatsAppTemplate(template) {
  if (template?.status !== 'APPROVED' || !/^[a-z][a-z0-9_]{0,511}$/.test(String(template?.name || ''))
      || !/^[a-z]{2,3}_[A-Z]{2}$/.test(String(template?.language || ''))) return false;
  const components = template?.components;
  if (!Array.isArray(components) || !components.some((item) => item.type === 'BODY')) return false;
  return components.every((item) => {
    if (item?.type === 'BODY') return Boolean(String(item.text || '').trim()) && !/\{\{\s*\d+\s*\}\}/.test(item.text);
    if (item?.type === 'FOOTER') return true;
    if (item?.type === 'HEADER') return item.format === 'TEXT'
      && Boolean(String(item.text || '').trim())
      && !/\{\{\s*\d+\s*\}\}/.test(item.text);
    return false;
  });
}

export function whatsappFailureDescription(message) {
  const error = message?.raw_payload?.meta_status?.errors?.[0];
  if (Number(error?.code) === 131047) {
    return 'A Meta não entregou: passaram mais de 24h desde a última mensagem do lead. Use um modelo aprovado.';
  }
  if (error?.error_data?.details) return String(error.error_data.details).slice(0, 180);
  return message?.status === 'failed' ? 'A Meta não entregou esta mensagem.' : null;
}
