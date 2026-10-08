import { WORKSPACE, webhookDestination } from './helpers.mjs';

function sentAt(timestamp) {
  const numeric = Number(timestamp);
  const ms = numeric > 1e12 ? numeric : numeric * 1000;
  return Number.isFinite(ms) && Math.abs(ms) < 8.64e15
    ? new Date(ms).toISOString() : new Date().toISOString();
}

function body(message) {
  return String(message?.text?.body || message?.button?.text
    || message?.interactive?.button_reply?.title || message?.interactive?.list_reply?.title
    || message?.image?.caption || message?.video?.caption || message?.document?.caption
    || (message?.type ? '[' + message.type + ']' : '')).slice(0, 20000);
}

export async function saveWorkspaceMessages(db, change, connection) {
  const value = change.value;
  const table = 'workspace_meta_messages';
  const contacts = new Map((value.contacts || []).map((contact) => [
    String(contact.wa_id), contact.profile?.name || null,
  ]));
  const list = change.field === 'messages' ? value.messages || []
    : change.field === 'smb_message_echoes' ? value.message_echoes || [] : [];
  for (const message of list) {
    if (message.type === 'revoke' || message.type === 'edit') {
      const original = message[message.type]?.original_message_id;
      if (!original) continue;
      const update = message.type === 'revoke'
        ? { body: '[Mensagem apagada no WhatsApp Business]', status: 'revoked', raw_payload: message }
        : { body: body(message.edit.message || message), raw_payload: message };
      const { error } = await db.from(table).update(update)
        .eq('connection_id', connection.id).eq('meta_message_id', original);
      if (error) throw error;
      continue;
    }
    if (!message.id) continue;
    const direction = change.field === 'messages' ? 'inbound' : 'outbound';
    const contactId = String(direction === 'inbound' ? message.from || '' : message.to || '').replace(/\D/g, '');
    if (!contactId) continue;
    const { error } = await db.from(table).upsert({
      connection_id: connection.id, owner_user_id: connection.owner_user_id,
      meta_message_id: String(message.id), contact_wa_id: contactId,
      profile_name: contacts.get(contactId) || null, direction,
      message_type: message.type || 'unknown', body: body(message),
      status: direction === 'inbound' ? 'received' : 'sent',
      sent_at: sentAt(message.timestamp), raw_payload: message,
    }, { onConflict: 'connection_id,meta_message_id', ignoreDuplicates: true });
    if (error) throw error;
  }
  if (change.field === 'messages') {
    for (const status of value.statuses || []) {
      if (!status.id) continue;
      const { error } = await db.from(table).update({ status: status.status || 'unknown' })
        .eq('connection_id', connection.id).eq('meta_message_id', status.id);
      if (error) throw error;
    }
  }
}

export async function dispatchWorkspaceWebhook(db, change, primary) {
  const { data, error } = await db.from('workspace_meta_connections')
    .select('id,owner_user_id,workspace_id,platform,external_account_id,waba_id,state')
    .eq('workspace_id', WORKSPACE).eq('platform', 'whatsapp').eq('waba_id', String(change.wabaId || ''));
  if (error) throw error;
  const destination = webhookDestination(change, data || [], primary);
  if (destination.target === WORKSPACE) await saveWorkspaceMessages(db, change, destination.connection);
  return destination.target;
}
