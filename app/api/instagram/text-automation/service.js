const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

export function extractTextSelectionEvents(payload, now = Date.now()) {
  if (payload?.object !== 'instagram' || !Array.isArray(payload.entry)) return [];

  return payload.entry.flatMap((entry) => (Array.isArray(entry?.messaging) ? entry.messaging : []).flatMap((event) => {
    const message = event?.message || {};
    const postback = event?.postback || {};
    const senderId = String(event?.sender?.id || '');
    const accountId = String(entry?.id || '');
    const recipientId = String(event?.recipient?.id || '');
    const timestamp = Number(event?.timestamp);
    const messageId = String(message?.mid || postback?.mid || '');
    const quickReplyPayload = String(message?.quick_reply?.payload || postback?.payload || '').trim();
    const text = String(message?.text || postback?.title || '').trim();

    if (!messageId || (!quickReplyPayload && !text) || message?.is_echo || message?.is_deleted
      || !/^\d+$/.test(senderId) || !/^\d+$/.test(accountId) || senderId === accountId
      || recipientId !== accountId || !Number.isFinite(timestamp)
      || timestamp < now - MAX_EVENT_AGE_MS || timestamp > now + MAX_FUTURE_SKEW_MS) return [];

    return [{ accountId, senderId, messageId, quickReplyPayload, text, timestamp }];
  }));
}

export function matchesTextAutomation(event, automation) {
  if (event.quickReplyPayload) return event.quickReplyPayload === automation.quick_reply_payload;
  const text = normalizeText(event.text);
  const keyword = normalizeText(automation.direct_keyword);
  return Boolean(keyword && text.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, '') === keyword)
    || Boolean(automation.quick_reply_title && text === normalizeText(automation.quick_reply_title));
}

export function buildTextMenu(automation) {
  const text = String(automation.menu_message || '').trim();
  const buttons = Array.isArray(automation.menu_buttons) ? automation.menu_buttons : [];
  if (!text || buttons.length < 1 || buttons.length > 3) throw new Error('Menu da automação inválido.');

  return {
    attachment: {
      type: 'template',
      payload: {
        template_type: 'button',
        text,
        buttons: buttons.map((button) => ({
          type: 'web_url',
          title: String(button.title || '').slice(0, 20),
          url: String(button.url || ''),
        })),
      },
    },
  };
}
