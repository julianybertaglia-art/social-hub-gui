import { getSupabaseAdmin, sendWhatsAppVoiceByUrl } from '../lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CAMPAIGN_KEY = 'catchup-audio-2026-09-17';

function phone(value) {
  return String(value || '').replace(/\D/g, '');
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  if (body?.action !== 'send-next') {
    return Response.json({ ok: false, error: 'Ação inválida.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: rows, error: readError } = await supabase
    .from('whatsapp_audio_campaign_logs')
    .select('id,contact_id,segment,status')
    .eq('campaign_key', CAMPAIGN_KEY)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);
  if (readError) return Response.json({ ok: false, error: readError.message }, { status: 500 });

  const row = rows?.[0];
  if (!row) return Response.json({ ok: true, done: true });

  const { data: claimed, error: claimError } = await supabase
    .from('whatsapp_audio_campaign_logs')
    .update({ status: 'sending', reason: null, updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('id,contact_id,segment')
    .maybeSingle();
  if (claimError || !claimed) return Response.json({ ok: false, error: claimError?.message || 'Item ocupado.' }, { status: 409 });

  try {
    const { data: contact, error: contactError } = await supabase
      .from('whatsapp_contacts')
      .select('id,profile_name,phone,wa_id,tags')
      .eq('id', claimed.contact_id)
      .single();
    if (contactError) throw contactError;

    const { data: inbound } = await supabase
      .from('whatsapp_messages')
      .select('sent_at')
      .eq('contact_id', contact.id)
      .eq('direction', 'inbound')
      .order('sent_at', { ascending: false })
      .limit(1);
    const lastInbound = inbound?.[0]?.sent_at ? Date.parse(inbound[0].sent_at) : 0;
    if (!lastInbound || Date.now() - lastInbound >= 24 * 60 * 60 * 1000) {
      throw new Error('Lead fora da janela oficial de 24h da Meta.');
    }

    const { data: previous } = await supabase
      .from('whatsapp_messages')
      .select('id')
      .eq('contact_id', contact.id)
      .eq('direction', 'outbound')
      .eq('message_type', 'audio')
      .in('status', ['sent', 'delivered', 'read', 'played'])
      .limit(1);
    if (previous?.length) throw new Error('Lead já recebeu áudio.');

    const { data: asset, error: assetError } = await supabase
      .from('whatsapp_campaign_audio_assets')
      .select('key,sha256,data_base64')
      .eq('key', claimed.segment)
      .maybeSingle();
    if (assetError || !asset?.data_base64) throw new Error(assetError?.message || 'Áudio não encontrado.');

    const recipient = phone(contact.phone || contact.wa_id);
    if (!recipient) throw new Error('Número inválido.');

    const origin = new URL(request.url).origin;
    const audioUrl = origin + '/api/whatsapp/campaign-audio?key=' + encodeURIComponent(claimed.segment)
      + '&raw=1&v=' + encodeURIComponent(asset.sha256 || Date.now());
    const result = await sendWhatsAppVoiceByUrl({ to: recipient, audioUrl });
    const messageId = result?.messages?.[0]?.id || result?.messageId || null;
    const now = new Date().toISOString();

    await supabase.from('whatsapp_messages').insert({
      meta_message_id: messageId,
      contact_id: contact.id,
      direction: 'outbound',
      message_type: 'audio',
      body: '🎙️ Áudio do Gui · catch-up 17/09 · ' + claimed.segment,
      status: 'sent',
      raw_payload: { provider: 'meta', campaign: CAMPAIGN_KEY, segment: claimed.segment, result },
      sent_at: now,
    });

    const currentTags = Array.isArray(contact.tags) ? contact.tags : [];
    const segmentTag = claimed.segment === 'seller' ? 'Já vende' : 'Iniciante';
    const tags = Array.from(new Set([...currentTags, segmentTag, 'Áudio Gui enviado · 17/09']));
    await supabase.from('whatsapp_contacts').update({ tags, last_message_at: now, updated_at: now }).eq('id', contact.id);
    await supabase.from('whatsapp_audio_campaign_logs').update({ status: 'sent', message_id: messageId, sent_at: now, updated_at: now }).eq('id', claimed.id);

    return Response.json({ ok: true, sent: true, name: contact.profile_name || recipient, segment: claimed.segment, messageId });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Falha no envio.';
    await supabase.from('whatsapp_audio_campaign_logs').update({ status: 'failed', reason, updated_at: new Date().toISOString() }).eq('id', claimed.id);
    return Response.json({ ok: false, error: reason }, { status: 500 });
  }
}
