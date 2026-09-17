import { getSupabaseAdmin, normalizeWaId, sendWhatsAppCtaUrl } from '../lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const APPLICATION_ID = '1d906e82-6ef4-472c-b2cd-3a1f3ea59c15';
const CONTACT_ID = '9bdace68-a8e3-4356-b657-5c23945eb51f';

export async function GET(request) {
  const supabase = getSupabaseAdmin();
  const { data: application, error } = await supabase
    .from('influencer_applications')
    .select('id,contact_id,wa_id,public_token,source,status')
    .eq('id', APPLICATION_ID)
    .eq('contact_id', CONTACT_ID)
    .eq('source', 'user_preview')
    .eq('status', 'draft')
    .maybeSingle();

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  if (!application) return Response.json({ ok: true, sent: false, reason: 'already_sent_or_missing' });

  const origin = new URL(request.url).origin;
  const url = origin + '/parcerias/vital-influenciadores/' + encodeURIComponent(application.public_token);
  const text = 'Oi, Juliany! 💛\n\nPedimos desculpas mais uma vez pelo transtorno. Estamos atualizando nosso sistema para conseguir atender vocês cada vez melhor e identificamos um problema no link enviado anteriormente.\n\nJá fizemos uma nova correção. Por favor, desconsidere os links anteriores e use o botão abaixo para acessar o formulário.\n\nObrigada pela compreensão e pela paciência com a gente! 💛';

  try {
    const result = await sendWhatsAppCtaUrl({
      to: normalizeWaId(application.wa_id),
      body: text,
      buttonText: 'Abrir formulário',
      url,
    });

    const messageId = result?.messages?.[0]?.id || result?.messageId || null;
    const now = new Date().toISOString();

    await supabase.from('whatsapp_messages').insert({
      meta_message_id: messageId,
      contact_id: application.contact_id,
      direction: 'outbound',
      message_type: 'interactive',
      body: text,
      status: 'sent',
      raw_payload: { ...result, preview_url: url },
      sent_at: now,
    });

    await supabase.from('whatsapp_contacts')
      .update({ last_message_at: now, updated_at: now })
      .eq('id', application.contact_id);

    await supabase.from('influencer_applications')
      .update({ source: 'user_preview_sent', updated_at: now })
      .eq('id', application.id)
      .eq('source', 'user_preview');

    return Response.json({ ok: true, sent: true, messageId });
  } catch (sendError) {
    return Response.json({ ok: false, error: sendError instanceof Error ? sendError.message : 'Falha no envio' }, { status: 500 });
  }
}
