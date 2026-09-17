import { getSupabaseAdmin, normalizeWaId, sendWhatsAppText } from '../lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const supabase = getSupabaseAdmin();
  const { data: applications, error } = await supabase
    .from('influencer_applications')
    .select('id,contact_id,wa_id,profile_name,public_token,source,status')
    .eq('source', 'manual_resend_needed')
    .eq('status', 'draft')
    .limit(10);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const results = [];
  const origin = new URL(request.url).origin;

  for (const application of applications || []) {
    const { data: claimed, error: claimError } = await supabase
      .from('influencer_applications')
      .update({ source: 'manual_resend_sending', updated_at: new Date().toISOString() })
      .eq('id', application.id)
      .eq('source', 'manual_resend_needed')
      .select('id')
      .maybeSingle();

    if (claimError || !claimed) {
      results.push({ id: application.id, sent: false, skipped: true });
      continue;
    }

    const firstName = String(application.profile_name || 'Oi').trim().split(/\s+/)[0];
    const formUrl = origin + '/parcerias/vital-influenciadores?token=' + encodeURIComponent(application.public_token);
    const text = `Oi, ${firstName}! Me desculpa 🙏 O link do formulário que eu te enviei estava com um problema e, por isso, sua resposta não ficou registrada aqui pra gente. Já corrigimos. Você consegue preencher novamente por este link?\n\n${formUrl}\n\nDesculpa pelo transtorno 💛`;

    try {
      const result = await sendWhatsAppText({ to: normalizeWaId(application.wa_id), text });
      const messageId = result?.messages?.[0]?.id || result?.messageId || null;
      const now = new Date().toISOString();

      await supabase.from('whatsapp_messages').insert({
        meta_message_id: messageId,
        contact_id: application.contact_id,
        direction: 'outbound',
        message_type: 'text',
        body: text,
        status: 'sent',
        raw_payload: result,
        sent_at: now,
      });

      await supabase.from('whatsapp_contacts')
        .update({ last_message_at: now, updated_at: now })
        .eq('id', application.contact_id);

      await supabase.from('influencer_applications')
        .update({ source: 'manual_resend_sent', updated_at: now })
        .eq('id', application.id);

      results.push({ id: application.id, sent: true, messageId });
    } catch (sendError) {
      await supabase.from('influencer_applications')
        .update({ source: 'manual_resend_needed', updated_at: new Date().toISOString() })
        .eq('id', application.id);

      results.push({
        id: application.id,
        sent: false,
        error: sendError instanceof Error ? sendError.message : 'Falha no envio',
      });
    }
  }

  return Response.json({ ok: true, count: results.filter((item) => item.sent).length, results }, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
