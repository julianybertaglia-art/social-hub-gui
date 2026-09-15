import { getSupabaseAdmin, sendWhatsAppVoiceByUrl } from '../lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SENT_TAG = 'Áudio Gui enviado · 15/09';
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
  const assets = new Map();

  for (const target of TARGETS) {
    try {
      const { data: contact, error: contactError } = await supabase
        .from('whatsapp_contacts')
        .select('id,phone,wa_id,tags')
        .eq('id', target.id)
        .single();
      if (contactError) throw contactError;

      const tags = Array.isArray(contact.tags) ? contact.tags : [];
      if (tags.includes(SENT_TAG)) {
        results.push({ id: target.id, segment: target.segment, status: 'already_sent' });
        continue;
      }

      const { data: previous, error: previousError } = await supabase
        .from('whatsapp_messages')
        .select('id,status,meta_message_id')
        .eq('contact_id', target.id)
        .eq('direction', 'outbound')
        .eq('message_type', 'audio')
        .gte('sent_at', '2026-09-15T00:00:00Z')
        .limit(1);
      if (previousError) throw previousError;
      if (previous?.length) {
        results.push({ id: target.id, segment: target.segment, status: 'audio_already_exists', messageId: previous[0].meta_message_id || null });
        continue;
      }

      let asset = assets.get(target.segment);
      if (!asset) {
        const { data, error } = await supabase
          .from('whatsapp_campaign_audio_assets')
          .select('sha256,data_base64')
          .eq('key', target.segment)
          .single();
        if (error) throw error;
        if (!data?.data_base64) throw new Error('Áudio não encontrado para ' + target.segment);
        asset = data;
        assets.set(target.segment, asset);
      }

      const audioUrl = origin
        + '/api/whatsapp/campaign-audio?key=' + encodeURIComponent(target.segment)
        + '&raw=1&v=' + encodeURIComponent(asset.sha256 || Date.now());

      const result = await sendWhatsAppVoiceByUrl({
        to: contact.phone || contact.wa_id,
        audioUrl,
      });
      const messageId = result?.messages?.[0]?.id || null;
      if (!messageId) throw new Error('A Meta não devolveu o ID da mensagem.');

      const now = new Date().toISOString();
      const { error: messageError } = await supabase
        .from('whatsapp_messages')
        .insert({
          meta_message_id: messageId,
          contact_id: target.id,
          direction: 'outbound',
          message_type: 'audio',
          body: '🎙️ Áudio do Gui · 15/09 · ' + target.segment,
          status: 'sent',
          raw_payload: result,
          sent_at: now,
        });
      if (messageError) throw messageError;

      const segmentTag = target.segment === 'seller' ? 'Áudio Gui · Seller' : 'Áudio Gui · Iniciante';
      const nextTags = [...new Set([...tags, segmentTag, SENT_TAG])];
      const { error: updateError } = await supabase
        .from('whatsapp_contacts')
        .update({ tags: nextTags, last_message_at: now, updated_at: now })
        .eq('id', target.id);
      if (updateError) throw updateError;

      results.push({ id: target.id, segment: target.segment, status: 'sent', messageId });
    } catch (error) {
      results.push({ id: target.id, segment: target.segment, status: 'failed', error: error instanceof Error ? error.message : 'Falha ao enviar' });
    }
  }

  return Response.json({ ok: true, results }, { headers: { 'Cache-Control': 'no-store' } });
}
