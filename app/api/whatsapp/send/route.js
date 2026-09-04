import { getSupabaseAdmin, normalizeWaId, sendWhatsAppText, upsertWhatsAppContact } from '../lib';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const to = normalizeWaId(body?.to);
  const text = String(body?.text || '').trim();

  if (!to || !text) {
    return Response.json({ ok: false, error: 'Número e mensagem são obrigatórios.' }, { status: 400 });
  }

  try {
    const result = await sendWhatsAppText({ to, text });
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
      message_type: 'text',
      body: text,
      status: 'sent',
      raw_payload: result,
      sent_at: now,
    });

    if (error) throw error;
    return Response.json({ ok: true, messageId: metaMessageId, contact });
  } catch (error) {
    const status = error?.code === 'WHATSAPP_NOT_CONFIGURED' ? 503 : 500;
    return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Falha ao enviar mensagem.' }, { status });
  }
}
