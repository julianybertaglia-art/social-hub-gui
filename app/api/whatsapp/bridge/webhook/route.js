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

function newestDate(left, right) {
  const leftMs = Date.parse(left || '');
  const rightMs = Date.parse(right || '');
  if (!Number.isFinite(leftMs)) return right;
  if (!Number.isFinite(rightMs)) return left;
  return leftMs >= rightMs ? left : right;
}

async function resolveCanonicalWaId(supabase, value) {
  const rawWaId = normalizeWaId(value);
  if (!rawWaId) return '';

  const { data, error } = await supabase
    .from('whatsapp_contact_aliases')
    .select('canonical_wa_id')
    .eq('alias_wa_id', rawWaId)
    .maybeSingle();

  if (error) throw error;
  return normalizeWaId(data?.canonical_wa_id || rawWaId);
}

export async function POST(request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: 'Não autorizado.' }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const message = payload?.message;
  const event = String(payload?.event || 'message').toLowerCase();

  if (!message?.id || !message?.chatId) {
    return Response.json({ ok: false, error: 'Evento de mensagem inválido.' }, { status: 400 });
  }

  const contactRef = message.contactId
    || (message.fromMe ? message.chatId : (message.senderId || message.chatId));
  const rawWaId = normalizeWaId(contactRef);
  if (!rawWaId) {
    return Response.json({ ok: false, error: 'Contato inválido.' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const waId = await resolveCanonicalWaId(supabase, rawWaId);
    const receivedAt = message.timestamp || new Date().toISOString();
    let lastMessageAt = receivedAt;

    if (event === 'history') {
      const { data: existing } = await supabase
        .from('whatsapp_contacts')
        .select('last_message_at')
        .eq('wa_id', waId)
        .maybeSingle();
      if (existing?.last_message_at) {
        lastMessageAt = newestDate(existing.last_message_at, receivedAt);
      }
    }

    const source = message.isGroup
      ? 'WhatsApp Bridge · Grupo'
      : event === 'history'
        ? 'WhatsApp Bridge · Histórico'
        : 'WhatsApp Bridge';

    const contact = await upsertWhatsAppContact(supabase, {
      waId,
      profileName: message.fromMe ? null : (message.senderName || null),
      source,
      lastMessageAt,
    });

    const direction = message.fromMe ? 'outbound' : 'inbound';
    const { error } = await supabase
      .from('whatsapp_messages')
      .upsert({
        meta_message_id: message.id,
        contact_id: contact.id,
        direction,
        message_type: message.type || 'text',
        body: fallbackBody(message),
        status: direction === 'outbound' ? 'sent' : 'received',
        raw_payload: {
          ...payload,
          lynna_contact_resolution: {
            raw_wa_id: rawWaId,
            canonical_wa_id: waId,
          },
        },
        sent_at: receivedAt,
      }, {
        onConflict: 'meta_message_id',
        ignoreDuplicates: true,
      });

    if (error) throw error;

    return Response.json({
      ok: true,
      event,
      direction,
      contactId: contact.id,
      messageId: message.id,
      canonicalWaId: waId,
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Falha ao salvar mensagem do WhatsApp.',
    }, { status: 500 });
  }
}
