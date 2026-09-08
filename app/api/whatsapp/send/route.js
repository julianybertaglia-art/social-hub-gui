import {
  getSupabaseAdmin,
  normalizeWaId,
  sendWhatsAppText,
  sendWhatsAppVoiceByUrl,
  upsertWhatsAppContact,
} from '../lib';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const to = normalizeWaId(body?.to);
  const text = String(body?.text || '').trim();
  const audioUrl = String(body?.audioUrl || '').trim();
  const wantsVoice = Boolean(audioUrl);

  if (!to || (!text && !audioUrl)) {
    return Response.json({ ok: false, error: 'Número e conteúdo da mensagem são obrigatórios.' }, { status: 400 });
  }

  if (text && audioUrl) {
    return Response.json({ ok: false, error: 'Envie texto ou áudio por vez.' }, { status: 400 });
  }

  try {
    const result = wantsVoice
      ? await sendWhatsAppVoiceByUrl({ to, audioUrl })
      : await sendWhatsAppText({ to, text });

    const metaMessageId = result?.messages?.[0]?.id || null;
    const now = new Date().toISOString();
    const supabase = getSupabaseAdmin();
    const contact = await upsertWhatsAppContact(supabase, {
      waId: to,
      source: 'WhatsApp',
      lastMessageAt: now,
    });

    const { error } = await supabase.from('whatsapp_messages').insert({
      meta_message_id: metaMessageId,
      contact_id: contact.id,
      direction: 'outbound',
      message_type: wantsVoice ? 'audio' : 'text',
      body: wantsVoice ? '🎙️ Mensagem de voz' : text,
      status: 'sent',
      raw_payload: result,
      sent_at: now,
    });

    if (error) throw error;
    return Response.json({ ok: true, messageId: metaMessageId, contact, type: wantsVoice ? 'audio' : 'text' });
  } catch (error) {
    const status = error?.code === 'WHATSAPP_NOT_CONFIGURED' ? 503 : 500;
    return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Falha ao enviar mensagem.' }, { status });
  }
}
