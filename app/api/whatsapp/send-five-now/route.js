import { getSupabaseAdmin, sendWhatsAppVoiceByUrl } from '../lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TARGETS = [
  { id: '28901cae-735a-4408-b3de-f2497c54039e', segment: 'seller' },
  { id: '308522c0-1a4f-48ff-9785-de8c74aba9a7', segment: 'iniciante' },
  { id: '730336a8-6ba4-4d6d-83cc-327323287e61', segment: 'iniciante' },
  { id: '3491ba9c-d7f2-4bc7-bf6c-1f9eb42f10a4', segment: 'iniciante' },
  { id: '4a79f051-f7b1-4edc-a222-638355c76c3f', segment: 'iniciante' },
];

export async function GET(request) {
  const supabase = getSupabaseAdmin();
  const origin = new URL(request.url).origin;
  const results = [];

  for (const target of TARGETS) {
    try {
      const { data: contact, error: contactError } = await supabase
        .from('whatsapp_contacts')
        .select('id,profile_name,phone,wa_id')
        .eq('id', target.id)
        .single();
      if (contactError) throw contactError;

      const audioUrl = origin + '/api/whatsapp/campaign-audio?key=' + encodeURIComponent(target.segment) + '&raw=1';
      const result = await sendWhatsAppVoiceByUrl({ to: contact.phone || contact.wa_id, audioUrl });
      const messageId = result?.messages?.[0]?.id || null;
      const now = new Date().toISOString();

      await supabase.from('whatsapp_messages').insert({
        meta_message_id: messageId,
        contact_id: contact.id,
        direction: 'outbound',
        message_type: 'audio',
        body: '🎙️ Áudio do Gui · reenvio solicitado 15/09',
        status: 'sent',
        raw_payload: result,
        sent_at: now,
      });

      results.push({ name: contact.profile_name || contact.phone, status: 'submitted', messageId });
    } catch (error) {
      results.push({ id: target.id, status: 'failed', error: error instanceof Error ? error.message : 'Falha ao enviar' });
    }
  }

  return Response.json({ ok: true, results }, { headers: { 'Cache-Control': 'no-store' } });
}
