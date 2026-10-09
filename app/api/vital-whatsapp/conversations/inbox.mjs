// Vital Decor inbox rules. Never read from the Gui Nonato WhatsApp tables.
export const WHATSAPP_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function canReplyWithinWindow(lastInboundAt, now = Date.now()) {
  const last = Date.parse(String(lastInboundAt || ''));
  const current = now instanceof Date ? now.getTime() : now;
  return Number.isFinite(last) && Number.isFinite(current)
    && current >= last && current - last < WHATSAPP_REPLY_WINDOW_MS - 30 * 1000;
}

export function summarizeVitalConversations(rows = [], now = Date.now()) {
  const contacts = new Map();
  for (const row of rows) {
    const phone = String(row.contact_wa_id || '').replace(/\D/g, '');
    if (!/^\d{8,15}$/.test(phone)) continue;
    const item = contacts.get(phone) || {
      id: phone, phone, name: '', lastMessage: '',
      lastMessageAt: null, lastInboundAt: null, lastDirection: null,
      messageCount: 0,
    };
    item.messageCount++;
    if (row.profile_name && !item.name) item.name = String(row.profile_name).slice(0, 160);
    const stamp = row.sent_at || row.created_at || null;
    if (!item.lastMessageAt || (stamp && stamp > item.lastMessageAt)) {
      item.lastMessageAt = stamp;
      item.lastMessage = String(row.body || '').slice(0, 240);
      item.lastDirection = row.direction;
    }
    if (row.direction === 'inbound' && stamp && (!item.lastInboundAt || stamp > item.lastInboundAt)) {
      item.lastInboundAt = stamp;
    }
    contacts.set(phone, item);
  }
  return [...contacts.values()]
    .map(item => ({ ...item, name: item.name || item.phone,
      canReply: canReplyWithinWindow(item.lastInboundAt, now) }))
    .sort((a, b) => String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || '')));
}

export function presentVitalMessage(row) {
  return {
    id: row.id,
    phone: row.contact_wa_id,
    direction: row.direction,
    type: row.message_type,
    body: row.body,
    status: row.status,
    sentAt: row.sent_at || row.created_at,
  };
}
