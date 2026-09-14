import crypto from 'node:crypto';
import { getSupabaseAdmin, sendWhatsAppVoiceByUrl } from '../lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONTACT_ID = '546b2c3c-97de-4ffe-9c7c-fbc85117b4c6';
const TOKEN_HASH = '9c63ca3b40c2585f47307c511972b245e0d13dd422904caab43bf64c69163203';
const SENT_TAG = 'Áudio Gui enviado · 14/09';

function validToken(value) {
  const digest = crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
  const a = Buffer.from(digest, 'hex');
  const b = Buffer.from(TOKEN_HASH, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(request) {
  const url = new URL(request.url);
  if (!validToken(url.searchParams.get('run'))) {
    return Response.json({ ok: false, error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: contact, error: contactError } = await supabase
      .from('whatsapp_contacts')
      .select('id,profile_name,phone,wa_id,stage,tags')
      .eq('id', CONTACT_ID)
      .single();
    if (contactError) throw contactError;

    const tags = Array.isArray(contact.tags) ? contact.tags : [];
    if (tags.includes(SENT_TAG)) {
      return Response.json({ ok: true, skipped: true, reason: 'already_sent' });
    }

    const { data: previous, error: previousError } = await supabase
      .from('whatsapp_messages')
      .select('id,status,sent_at')
      .eq('contact_id', CONTACT_ID)
      .eq('direction', 'outbound')
      .eq('message_type', 'audio')
      .gte('sent_at', '2026-09-14T00:00:00Z')
      .limit(1);
    if (previousError) throw previousError;
    if (previous?.length) {
      return Response.json({ ok: true, skipped: true, reason: 'audio_already_exists' });
    }

    const { data: inbound, error: inboundError } = await supabase
      .from('whatsapp_messages')
      .select('sent_at')
      .eq('contact_id', CONTACT_ID)
      .eq('direction', 'inbound')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (inboundError) throw inboundError;
    if (!inbound?.sent_at || Date.now() - new Date(inbound.sent_at).getTime() >= 24 * 60 * 60 * 1000) {
      return Response.json({ ok: false, error: 'Fora da janela de 24h.' }, { status: 409 });
    }

    const { data: asset, error: assetError } = await supabase
      .from('whatsapp_campaign_audio_assets')
      .select('sha256,data_base64')
      .eq('key', 'seller')
      .single();
    if (assetError) throw assetError;
    if (!asset?.data_base64) throw new Error('Áudio seller não encontrado.');

    const origin = new URL(request.url).origin;
    const audioUrl = origin + '/api/whatsapp/campaign-audio?key=seller&raw=1&v=' + encodeURIComponent(asset.sha256 || Date.now());
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
        contact_id: CONTACT_ID,
        direction: 'outbound',
        message_type: 'audio',
        body: '🎙️ Áudio do Gui · nova leva 14/09 · seller',
        status: 'sent',
        raw_payload: result,
        sent_at: now,
      });
    if (messageError) throw messageError;

    const nextTags = [...new Set([...tags, 'Áudio Gui · Seller', SENT_TAG])];
    const { error: updateError } = await supabase
      .from('whatsapp_contacts')
      .update({ tags: nextTags, last_message_at: now, updated_at: now })
      .eq('id', CONTACT_ID);
    if (updateError) throw updateError;

    return Response.json({ ok: true, sent: true, contact: contact.profile_name || contact.phone, messageId });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Falha ao enviar.' }, { status: 500 });
  }
}
