import crypto from 'node:crypto';
import { getSupabaseAdmin, messageBody, normalizeWaId, upsertWhatsAppContact } from '../lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isValidSignature(rawBody, signatureHeader) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret || !signatureHeader?.startsWith('sha256=')) return false;

  const received = signatureHeader.slice('sha256='.length);
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const receivedBuffer = Buffer.from(received, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (receivedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

function eventChanges(payload) {
  if (!Array.isArray(payload?.entry)) return [];
  return payload.entry.flatMap((entry) =>
    Array.isArray(entry?.changes)
      ? entry.changes
          .filter((change) => change?.field && change?.value)
          .map((change) => ({ wabaId: entry?.id || null, field: change.field, value: change.value }))
      : []
  );
}

function toIso(timestamp) {
  if (!timestamp) return new Date().toISOString();
  const numeric = Number(timestamp);
  if (!Number.isFinite(numeric)) return new Date().toISOString();
  return new Date(numeric > 1e12 ? numeric : numeric * 1000).toISOString();
}

async function saveMessage(supabase, {
  id,
  contactId,
  direction,
  message,
  status,
  sentAt,
}) {
  const { error } = await supabase
    .from('whatsapp_messages')
    .upsert({
      meta_message_id: id,
      contact_id: contactId,
      direction,
      message_type: message?.type || 'unknown',
      body: messageBody(message),
      status,
      raw_payload: message,
      sent_at: sentAt,
    }, {
      onConflict: 'meta_message_id',
      ignoreDuplicates: true,
    });

  if (error) throw error;
}

async function handleMessages(supabase, value) {
  const contactsById = new Map(
    (value.contacts || []).map((contact) => [
      normalizeWaId(contact?.wa_id),
      contact?.profile?.name || null,
    ])
  );

  for (const message of value.messages || []) {
    const waId = normalizeWaId(message?.from);
    if (!waId) continue;

    const sentAt = toIso(message?.timestamp);
    const source = message?.referral ? 'Anúncio Meta' : 'WhatsApp';
    const contact = await upsertWhatsAppContact(supabase, {
      waId,
      profileName: contactsById.get(waId),
      source,
      lastMessageAt: sentAt,
    });

    await saveMessage(supabase, {
      id: message?.id || `inbound:${waId}:${message?.timestamp || Date.now()}`,
      contactId: contact.id,
      direction: 'inbound',
      message,
      status: 'received',
      sentAt,
    });
  }

  for (const status of value.statuses || []) {
    if (!status?.id) continue;
    const { error } = await supabase
      .from('whatsapp_messages')
      .update({ status: status.status || 'unknown' })
      .eq('meta_message_id', status.id);
    if (error) throw error;
  }
}

async function handleEchoes(supabase, value) {
  for (const message of value.message_echoes || []) {
    if (message?.type === 'revoke' && message?.revoke?.original_message_id) {
      const { error } = await supabase
        .from('whatsapp_messages')
        .update({ body: '[Mensagem apagada no WhatsApp Business]', status: 'revoked', raw_payload: message })
        .eq('meta_message_id', message.revoke.original_message_id);
      if (error) throw error;
      continue;
    }

    if (message?.type === 'edit' && message?.edit?.original_message_id) {
      const edited = message.edit.message || message;
      const { error } = await supabase
        .from('whatsapp_messages')
        .update({ body: messageBody(edited), status: 'sent', raw_payload: message })
        .eq('meta_message_id', message.edit.original_message_id);
      if (error) throw error;
      continue;
    }

    const waId = normalizeWaId(message?.to);
    if (!waId) continue;
    const sentAt = toIso(message?.timestamp);
    const contact = await upsertWhatsAppContact(supabase, {
      waId,
      source: 'WhatsApp Business',
      lastMessageAt: sentAt,
    });

    await saveMessage(supabase, {
      id: message?.id || `echo:${waId}:${message?.timestamp || Date.now()}`,
      contactId: contact.id,
      direction: 'outbound',
      message,
      status: 'sent',
      sentAt,
    });
  }
}

async function handleContactSync(supabase, value) {
  for (const item of value.state_sync || []) {
    if (item?.type !== 'contact' || item?.action === 'remove') continue;
    const waId = normalizeWaId(item?.contact?.phone_number || item?.contact?.wa_id);
    if (!waId) continue;

    await upsertWhatsAppContact(supabase, {
      waId,
      profileName: item?.contact?.full_name || item?.contact?.first_name || null,
      source: 'Contato WhatsApp Business',
      lastMessageAt: toIso(item?.metadata?.timestamp),
    });
  }
}

async function handleHistory(supabase, value) {
  const businessPhone = normalizeWaId(value?.metadata?.display_phone_number);

  for (const chunk of value.history || []) {
    if (Array.isArray(chunk?.errors) && chunk.errors.length) {
      console.warn('WhatsApp history sync declined/error:', chunk.errors);
      continue;
    }

    for (const thread of chunk?.threads || []) {
      const threadId = normalizeWaId(thread?.id || thread?.wa_id || thread?.chat_id);
      if (!threadId) continue;

      const messages = Array.isArray(thread?.messages) ? thread.messages : [];
      const timestamps = messages.map((message) => toIso(message?.timestamp)).sort();
      const lastMessageAt = timestamps[timestamps.length - 1] || new Date().toISOString();
      const contact = await upsertWhatsAppContact(supabase, {
        waId: threadId,
        profileName: thread?.contact?.full_name || thread?.profile?.name || null,
        source: 'Histórico WhatsApp',
        lastMessageAt,
      });

      for (let index = 0; index < messages.length; index += 1) {
        const message = messages[index];
        const from = normalizeWaId(message?.from);
        const direction = businessPhone && from === businessPhone ? 'outbound' : 'inbound';
        const sentAt = toIso(message?.timestamp);
        const historyStatus = String(message?.history_context?.status || '').toLowerCase();

        await saveMessage(supabase, {
          id: message?.id || `history:${threadId}:${message?.timestamp || 'unknown'}:${index}`,
          contactId: contact.id,
          direction,
          message,
          status: historyStatus || (direction === 'outbound' ? 'sent' : 'received'),
          sentAt,
        });
      }
    }
  }
}

export async function GET(request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const verifyToken = process.env.META_WHATSAPP_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (!verifyToken) {
    return Response.json({ ok: false, error: 'Token de verificação do WhatsApp não configurado.' }, { status: 503 });
  }

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return Response.json({ ok: false, error: 'Verificação recusada.' }, { status: 403 });
}

export async function POST(request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!isValidSignature(rawBody, signature)) {
    return Response.json({ ok: false, error: 'Assinatura inválida.' }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: false, error: 'JSON inválido.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  try {
    for (const change of eventChanges(payload)) {
      if (change.field === 'messages') await handleMessages(supabase, change.value);
      if (change.field === 'smb_message_echoes') await handleEchoes(supabase, change.value);
      if (change.field === 'smb_app_state_sync') await handleContactSync(supabase, change.value);
      if (change.field === 'history') await handleHistory(supabase, change.value);
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('WhatsApp webhook:', error);
    return Response.json({ ok: false, error: 'Falha ao processar evento do WhatsApp.' }, { status: 500 });
  }
}
