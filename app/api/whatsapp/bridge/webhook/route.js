import {
  getSupabaseAdmin,
  normalizeWaId,
  upsertWhatsAppContact,
} from '../../lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function authorized(request) {
  const expected = process.env.WHATSAPP_BRIDGE_WEBHOOK_TOKEN
    || process.env.WHATSAPP_BRIDGE_TOKEN;
  if (!expected) return false;
  return request.headers.get('authorization') === 'Bearer ' + expected;
}

function fallbackBody(message) {
  if (message?.text) return message.text;
  if (message?.type === 'image') return '📷 Imagem';
  if (message?.type === 'video') return '🎥 Vídeo';
  if (message?.type === 'audio') return '🎵 Áudio';
  if (message?.type === 'document') return '📎 Documento';
  if (message?.type === 'sticker') return '🖼️ Figurinha';
  return '[' + (message?.type || 'mensagem') + ']';
}

export async function POST(request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: 'Não autorizado.' }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const message = payload?.message;

  if (!message?.id || !message?.chatId) {
    return Response.json({ ok: false, error: 'Evento de mensagem inválido.' }, { status: 400 });
  }

  if (message.fromMe) {
    return Response.json({ ok: true, ignored: true });
  }

  const waId = normalizeWaId(message.senderId || message.chatId);
  if (!waId) {
    return Response.json({ ok: false, error: 'Remetente inválido.' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const receivedAt = message.timestamp || new Date().toISOString();
    const contact = await upsertWhatsAppContact(supabase, {
      waId,
      profileName: message.senderName || null,
      source: message.isGroup ? 'WhatsApp Bridge · Grupo' : 'WhatsApp Bridge',
      lastMessageAt: receivedAt,
    });

    const { error } = await supabase
      .from('whatsapp_messages')
      .upsert({
        meta_message_id: message.id,
        contact_id: contact.id,
        direction: 'inbound',
        message_type: message.type || 'text',
        body: fallbackBody(message),
        status: 'received',
        raw_payload: payload,
        received_at: receivedAt,
      }, {
        onConflict: 'meta_message_id',
        ignoreDuplicates: true,
      });

    if (error) throw error;

    return Response.json({
      ok: true,
      contactId: contact.id,
      messageId: message.id,
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Falha ao salvar mensagem recebida.',
    }, { status: 500 });
  }
}
