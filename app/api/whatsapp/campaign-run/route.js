import { getSupabaseAdmin, sendWhatsAppVoiceByUrl } from '../lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CAMPAIGN_KEY = 'audio-gui-2026-09-10-wave1';
const SEGMENT_TAG = {
  seller: 'Áudio Gui · Seller',
  iniciante: 'Áudio Gui · Iniciante',
};

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function counts(rows = []) {
  const result = {
    total: rows.length,
    pending: 0,
    sending: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    seller: { total: 0, sent: 0, pending: 0 },
    iniciante: { total: 0, sent: 0, pending: 0 },
  };
  for (const row of rows) {
    if (result[row.status] !== undefined) result[row.status] += 1;
    if (result[row.segment]) {
      result[row.segment].total += 1;
      if (row.status === 'sent') result[row.segment].sent += 1;
      if (row.status === 'pending') result[row.segment].pending += 1;
    }
  }
  return result;
}

async function loadCampaign(supabase) {
  const { data: logs, error: logsError } = await supabase
    .from('whatsapp_audio_campaign_logs')
    .select('id,contact_id,segment,status,message_id,reason,sent_at,updated_at,created_at')
    .eq('campaign_key', CAMPAIGN_KEY)
    .order('created_at', { ascending: true });
  if (logsError) throw logsError;

  const rows = logs || [];
  const contactIds = [...new Set(rows.map((row) => row.contact_id).filter(Boolean))];
  if (!contactIds.length) return rows.map((row) => ({ ...row, whatsapp_contacts: null }));

  const { data: contacts, error: contactsError } = await supabase
    .from('whatsapp_contacts')
    .select('id,profile_name,phone,wa_id,stage,tags,last_message_at')
    .in('id', contactIds);
  if (contactsError) throw contactsError;

  const byId = new Map((contacts || []).map((contact) => [contact.id, contact]));
  return rows.map((row) => ({
    ...row,
    whatsapp_contacts: byId.get(row.contact_id) || null,
  }));
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const rows = await loadCampaign(supabase);
    return Response.json(
      { ok: true, campaignKey: CAMPAIGN_KEY, counts: counts(rows), rows },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : 'Falha ao carregar campanha.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  if (body?.action !== 'send-next') {
    return Response.json({ ok: false, error: 'Ação inválida.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  let log = null;
  try {
    const { data: nextRows, error: nextError } = await supabase
      .from('whatsapp_audio_campaign_logs')
      .select('id,contact_id,segment,status,created_at')
      .eq('campaign_key', CAMPAIGN_KEY)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);
    if (nextError) throw nextError;

    log = nextRows?.[0] || null;
    if (!log) {
      const rows = await loadCampaign(supabase);
      return Response.json({ ok: true, done: true, counts: counts(rows) });
    }

    const { data: claimed, error: claimError } = await supabase
      .from('whatsapp_audio_campaign_logs')
      .update({ status: 'sending', reason: null, updated_at: new Date().toISOString() })
      .eq('id', log.id)
      .eq('status', 'pending')
      .select('id,contact_id,segment')
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return Response.json({ ok: true, busy: true });
    log = claimed;

    const { data: contact, error: contactError } = await supabase
      .from('whatsapp_contacts')
      .select('id,profile_name,phone,wa_id,stage,tags,last_message_at')
      .eq('id', log.contact_id)
      .single();
    if (contactError) throw contactError;

    const expectedTag = SEGMENT_TAG[log.segment];
    const contactTags = Array.isArray(contact.tags) ? contact.tags : [];
    const phone = normalizePhone(contact.phone || contact.wa_id);

    if (!phone || ['Venda', 'Perdido'].includes(contact.stage) || !contactTags.includes(expectedTag)) {
      const reason = !phone ? 'Número inválido' : 'Lead não está mais elegível para esta campanha';
      await supabase.from('whatsapp_audio_campaign_logs').update({ status: 'skipped', reason, updated_at: new Date().toISOString() }).eq('id', log.id);
      return Response.json({ ok: true, skipped: true, reason, contact: { id: contact.id, name: contact.profile_name, phone } });
    }

    const { data: latestMessages, error: latestError } = await supabase
      .from('whatsapp_messages')
      .select('direction,sent_at')
      .eq('contact_id', contact.id)
      .order('sent_at', { ascending: false })
      .limit(1);
    if (latestError) throw latestError;
    const latest = latestMessages?.[0] || null;

    if (latest?.direction === 'inbound') {
      const reason = 'Lead respondeu e precisa de atendimento antes do áudio';
      await supabase.from('whatsapp_audio_campaign_logs').update({ status: 'skipped', reason, updated_at: new Date().toISOString() }).eq('id', log.id);
      return Response.json({ ok: true, skipped: true, reason, contact: { id: contact.id, name: contact.profile_name, phone } });
    }

    const { data: asset, error: assetError } = await supabase
      .from('whatsapp_campaign_audio_assets')
      .select('key,sha256,data_base64')
      .eq('key', log.segment)
      .maybeSingle();
    if (assetError) throw assetError;
    if (!asset?.data_base64) throw new Error('Áudio ' + log.segment + ' não está salvo.');

    const origin = new URL(request.url).origin;
    const audioUrl = origin + '/api/whatsapp/campaign-audio?key=' + encodeURIComponent(log.segment)
      + '&raw=1&v=' + encodeURIComponent(asset.sha256 || Date.now());

    const result = await sendWhatsAppVoiceByUrl({ to: phone, audioUrl });
    const messageId = result?.messages?.[0]?.id || result?.messageId || null;
    const now = new Date().toISOString();

    const { error: messageError } = await supabase.from('whatsapp_messages').insert({
      meta_message_id: messageId,
      contact_id: contact.id,
      direction: 'outbound',
      message_type: 'audio',
      body: '🎙️ Áudio do Gui · campanha 10/09',
      status: 'sent',
      raw_payload: result,
      sent_at: now,
    });
    if (messageError) throw messageError;

    const sentTag = 'Áudio Gui enviado · 10/09';
    const nextTags = contactTags.includes(sentTag) ? contactTags : [...contactTags, sentTag];
    const { error: contactUpdateError } = await supabase
      .from('whatsapp_contacts')
      .update({ tags: nextTags, last_message_at: now, updated_at: now })
      .eq('id', contact.id);
    if (contactUpdateError) throw contactUpdateError;

    const { error: logUpdateError } = await supabase
      .from('whatsapp_audio_campaign_logs')
      .update({ status: 'sent', message_id: messageId, sent_at: now, reason: null, updated_at: now })
      .eq('id', log.id);
    if (logUpdateError) throw logUpdateError;

    const rows = await loadCampaign(supabase);
    return Response.json({
      ok: true,
      sent: true,
      done: counts(rows).pending === 0,
      contact: { id: contact.id, name: contact.profile_name, phone, segment: log.segment },
      messageId,
      counts: counts(rows),
    });
  } catch (error) {
    if (log?.id) {
      await supabase
        .from('whatsapp_audio_campaign_logs')
        .update({ status: 'failed', reason: error instanceof Error ? error.message : 'Falha ao enviar', updated_at: new Date().toISOString() })
        .eq('id', log.id)
        .catch(() => {});
    }
    return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Falha ao enviar próximo áudio.' }, { status: 500 });
  }
}
