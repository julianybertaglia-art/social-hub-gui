import { getSupabaseAdmin, normalizeWaId, sendWhatsAppCtaUrl } from '../lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const APPLICATION_IDS = [
  '4195e69e-097c-4c6e-ade0-20efb85a94b6',
  'efffa208-3e4a-4046-956d-fa0e30bae5b7',
  'ce991db1-cac1-4e97-bac5-31ae0df9b953',
  'c9b836fb-dc79-43a1-9f77-f9d57190a76f',
  'd5cc412e-ec62-4c8f-9c29-25939c874a10',
  '210eb3a6-33ac-44d2-b310-106c69f30938',
  'f5a91ba6-4e15-4177-92cc-470174f7138f',
];

export async function GET(request) {
  const supabase = getSupabaseAdmin();
  const { data: applications, error } = await supabase
    .from('influencer_applications')
    .select('id,contact_id,wa_id,profile_name,public_token,status,source')
    .in('id', APPLICATION_IDS)
    .eq('status', 'draft');

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const origin = new URL(request.url).origin;
  const text = 'Oi! 💛\n\nPedimos desculpas novamente pelo transtorno. Estamos atualizando nosso sistema para atender vocês cada vez melhor e corrigimos o problema no formulário.\n\nPor favor, desconsidere os links anteriores e use o botão abaixo para preencher o formulário atualizado.\n\nObrigada pela compreensão e pela paciência com a gente! 💛';
  const results = [];

  for (const application of applications || []) {
    if (application.source === 'final_resend_sent') {
      results.push({ id: application.id, profile_name: application.profile_name, skipped: true });
      continue;
    }

    const url = origin + '/parcerias/vital-influenciadores/' + encodeURIComponent(application.public_token);

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
        raw_payload: { ...result, preview_url: url, purpose: 'influencer_final_resend' },
        sent_at: now,
      });

      await supabase.from('whatsapp_contacts')
        .update({ last_message_at: now, updated_at: now })
        .eq('id', application.contact_id);

      await supabase.from('influencer_applications')
        .update({ source: 'final_resend_sent', updated_at: now })
        .eq('id', application.id)
        .eq('status', 'draft');

      results.push({ id: application.id, profile_name: application.profile_name, sent: true, messageId });
    } catch (sendError) {
      results.push({
        id: application.id,
        profile_name: application.profile_name,
        sent: false,
        error: sendError instanceof Error ? sendError.message : 'Falha no envio',
      });
    }
  }

  return Response.json({ ok: true, count: results.filter((item) => item.sent).length, results });
}
