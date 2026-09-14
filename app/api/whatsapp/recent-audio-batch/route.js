import crypto from 'node:crypto';
import { getSupabaseAdmin, sendWhatsAppVoiceByUrl } from '../lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BATCH_KEY = 'audio-recent-2026-09-14-v1';
const RUN_TOKEN_SHA256 = 'dc48a38db8642be88b7a5166651e9bdbb8d1624e5b2c9b87b6dd269eea7c4e88';
const SENT_TAG = 'Áudio Gui enviado · 14/09';

function validRunToken(value) {
  const digest = crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
  const a = Buffer.from(digest, 'hex');
  const b = Buffer.from(RUN_TOKEN_SHA256, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function segmentForBody(body) {
  const text = String(body || '').toLowerCase();
  if (text.includes('asx capacetes')) return 'seller';
  if (text.includes('tentando vender no mercado livre')) return 'iniciante';
  return null;
}

function within24Hours(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) && Date.now() - time >= 0 && Date.now() - time < 24 * 60 * 60 * 1000;
}

async function findCandidates(supabase) {
  const { data: matchingMessages, error: matchingError } = await supabase
    .from('whatsapp_messages')
    .select('contact_id,body,sent_at,direction')
    .eq('direction', 'inbound')
    .or('body.ilike.%Asx capacetes%,body.ilike.%tentando vender no mercado livre%')
    .gte('sent_at', '2026-09-14T00:00:00.000Z')
    .order('sent_at', { ascending: false });

  if (matchingError) throw matchingError;

  const segments = new Map();
  for (const message of matchingMessages || []) {
    const segment = segmentForBody(message.body);
    if (segment && !segments.has(message.contact_id)) {
      segments.set(message.contact_id, segment);
    }
  }

  const ids = [...segments.keys()];
  if (!ids.length) return [];

  const { data: contacts, error: contactError } = await supabase
    .from('whatsapp_contacts')
    .select('id,profile_name,phone,wa_id,stage,tags')
    .in('id', ids);
  if (contactError) throw contactError;

  const candidates = [];
  for (const contact of contacts || []) {
    if (['Venda', 'Perdido'].includes(contact.stage)) continue;
    const tags = Array.isArray(contact.tags) ? contact.tags : [];
    if (tags.includes(SENT_TAG)) continue;

    const { data: inbound, error: inboundError } = await supabase
      .from('whatsapp_messages')
      .select('sent_at')
      .eq('contact_id', contact.id)
      .eq('direction', 'inbound')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (inboundError) throw inboundError;
    if (!inbound?.sent_at || !within24Hours(inbound.sent_at)) continue;

    const { data: previousAudio, error: previousAudioError } = await supabase
      .from('whatsapp_messages')
      .select('id')
      .eq('contact_id', contact.id)
      .eq('direction', 'outbound')
      .eq('message_type', 'audio')
      .gte('sent_at', '2026-09-14T00:00:00.000Z')
      .limit(1);
    if (previousAudioError) throw previousAudioError;
    if (previousAudio?.length) continue;

    candidates.push({ ...contact, segment: segments.get(contact.id), lastInboundAt: inbound.sent_at });
  }

  return candidates;
}

async function claimQueueItem(supabase, contact, segment) {
  const now = new Date().toISOString();
  const { error: insertError } = await supabase
    .from('whatsapp_outbound_queue')
    .upsert({
      batch_key: BATCH_KEY,
      contact_id: contact.id,
      message_type: 'audio',
      segment,
      status: 'pending',
      not_before: now,
      updated_at: now,
    }, { onConflict: 'batch_key,contact_id', ignoreDuplicates: true });
  if (insertError) throw insertError;

  const { data: row, error: readError } = await supabase
    .from('whatsapp_outbound_queue')
    .select('id,status,message_id,reason')
    .eq('batch_key', BATCH_KEY)
    .eq('contact_id', contact.id)
    .single();
  if (readError) throw readError;

  if (row.status === 'sent') return { row, claimed: false, alreadySent: true };
  if (row.status === 'sending') return { row, claimed: false, alreadySending: true };

  const { data: claimed, error: claimError } = await supabase
    .from('whatsapp_outbound_queue')
    .update({ status: 'sending', reason: null, updated_at: now })
    .eq('id', row.id)
    .in('status', ['pending', 'failed'])
    .select('id,status')
    .maybeSingle();
  if (claimError) throw claimError;

  return { row: claimed || row, claimed: Boolean(claimed) };
}

async function sendCandidate(request, supabase, contact) {
  const claim = await claimQueueItem(supabase, contact, contact.segment);
  if (!claim.claimed) {
    return {
      contact: contact.profile_name || contact.phone,
      segment: contact.segment,
      status: claim.alreadySent ? 'already_sent' : 'already_processing',
    };
  }

  let messageId = null;
  try {
    const { data: asset, error: assetError } = await supabase
      .from('whatsapp_campaign_audio_assets')
      .select('key,sha256,data_base64')
      .eq('key', contact.segment)
      .single();
    if (assetError) throw assetError;
    if (!asset?.data_base64) throw new Error('Áudio ' + contact.segment + ' não está salvo.');

    const origin = new URL(request.url).origin;
    const audioUrl = origin
      + '/api/whatsapp/campaign-audio?key=' + encodeURIComponent(contact.segment)
      + '&raw=1&v=' + encodeURIComponent(asset.sha256 || Date.now());

    const result = await sendWhatsAppVoiceByUrl({
      to: contact.phone || contact.wa_id,
      audioUrl,
    });
    messageId = result?.messages?.[0]?.id || null;
    if (!messageId) throw new Error('A Meta não devolveu o ID da mensagem.');

    const now = new Date().toISOString();
    const { error: messageError } = await supabase
      .from('whatsapp_messages')
      .insert({
        meta_message_id: messageId,
        contact_id: contact.id,
        direction: 'outbound',
        message_type: 'audio',
        body: '🎙️ Áudio do Gui · nova leva 14/09 · ' + contact.segment,
        status: 'sent',
        raw_payload: result,
        sent_at: now,
      });
    if (messageError) throw messageError;

    const oldTags = Array.isArray(contact.tags) ? contact.tags : [];
    const segmentTag = contact.segment === 'seller' ? 'Áudio Gui · Seller' : 'Áudio Gui · Iniciante';
    const nextTags = [...new Set([...oldTags, segmentTag, SENT_TAG])];
    const { error: contactError } = await supabase
      .from('whatsapp_contacts')
      .update({ tags: nextTags, last_message_at: now, updated_at: now })
      .eq('id', contact.id);
    if (contactError) throw contactError;

    const { error: queueError } = await supabase
      .from('whatsapp_outbound_queue')
      .update({ status: 'sent', message_id: messageId, reason: null, sent_at: now, updated_at: now })
      .eq('batch_key', BATCH_KEY)
      .eq('contact_id', contact.id);
    if (queueError) throw queueError;

    return {
      contact: contact.profile_name || contact.phone,
      segment: contact.segment,
      status: 'sent',
      messageId,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Falha ao enviar áudio.';
    await supabase
      .from('whatsapp_outbound_queue')
      .update({ status: 'failed', message_id: messageId, reason, updated_at: new Date().toISOString() })
      .eq('batch_key', BATCH_KEY)
      .eq('contact_id', contact.id);
    return {
      contact: contact.profile_name || contact.phone,
      segment: contact.segment,
      status: 'failed',
      error: reason,
    };
  }
}

export async function GET(request) {
  const url = new URL(request.url);
  if (!validRunToken(url.searchParams.get('run'))) {
    return Response.json({ ok: false, error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const candidates = await findCandidates(supabase);
    const results = [];
    for (const contact of candidates) {
      results.push(await sendCandidate(request, supabase, contact));
    }

    return Response.json({
      ok: true,
      batchKey: BATCH_KEY,
      candidates: candidates.length,
      results,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Falha no disparo.',
    }, { status: 500 });
  }
}
