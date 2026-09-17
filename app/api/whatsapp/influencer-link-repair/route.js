import { getSupabaseAdmin, normalizeWaId, sendWhatsAppCtaUrl } from '../lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const supabase = getSupabaseAdmin();
  const { data: applications, error } = await supabase
    .from('influencer_applications')
    .select('id,contact_id,wa_id,profile_name,public_token,status,source')
    .eq('status', 'draft')
    .eq('source', 'manual_link_repair_pending')
    .limit(20);

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const origin = new URL(request.url).origin;
  const results = [];

  for (const application of applications || []) {
    const { data: claimed, error: claimError } = await supabase
      .from('influencer_applications')
      .update({ source: 'manual_link_repair_sending', updated_at: new Date().toISOString() })
      .eq('id', application.id)
      .eq('source', 'manual_link_repair_pending')
      .select('id')
      .maybeSingle();

    if (claimError || !claimed) {
      results.push({ id: application.id, sent: false, skipped: true });
      continue;
    }

    const firstName = String(application.profile_name || 'Oi').trim().split(/\s+/)[0];
    const url = origin + '/parcerias/vital-influenciadores/' + encodeURIComponent(application.public_token);
    const text = `Oi, ${firstName}! Me desculpa pelo transtorno 💛\n\nIdentificamos que o link anterior do formulário estava abrindo com erro para alguns perfis. Já corrigimos de verdade agora.\n\nPor favor, desconsidere o link anterior e use o botão abaixo para preencher novamente.`;

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
        raw_payload: { ...result, repair_url: url },
        sent_at: now,
      });

      await supabase.from('whatsapp_contacts')
        .update({ last_message_at: now, updated_at: now })
        .eq('id', application.contact_id);

      await supabase.from('influencer_applications')
        .update({ source: 'manual_link_repaired', updated_at: now })
        .eq('id', application.id);

      results.push({ id: application.id, sent: true, messageId });
    } catch (sendError) {
      await supabase.from('influencer_applications')
        .update({ source: 'manual_link_repair_pending', updated_at: new Date().toISOString() })
        .eq('id', application.id);
      results.push({
        id: application.id,
        sent: false,
        error: sendError instanceof Error ? sendError.message : 'Falha no envio',
      });
    }
  }

  return Response.json({
    ok: true,
    count: results.filter((item) => item.sent).length,
    results,
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
