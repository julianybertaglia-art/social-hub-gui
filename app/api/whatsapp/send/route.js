import {
  getSupabaseAdmin,
  getWhatsAppProvider,
  normalizeWaId,
  normalizeWhatsAppRecipient,
  sendWhatsAppText,
  sendWhatsAppVoiceByUrl,
  upsertWhatsAppContact,
} from '../lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CAMPAIGN_KEY = 'audio-gui-2026-09-10-wave1';
const SEGMENT_TAG = {
  seller: 'Áudio Gui · Seller',
  iniciante: 'Áudio Gui · Iniciante',
};

function campaignCounts(rows = []) {
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
    if (typeof result[row.status] === 'number') result[row.status] += 1;
    if (result[row.segment]) {
      result[row.segment].total += 1;
      if (row.status === 'sent') result[row.segment].sent += 1;
      if (row.status === 'pending') result[row.segment].pending += 1;
    }
  }
  return result;
}

async function loadCampaignLogs(supabase) {
  const { data, error } = await supabase
    .from('whatsapp_audio_campaign_logs')
    .select('id,contact_id,segment,status,message_id,reason,sent_at,updated_at,created_at')
    .eq('campaign_key', CAMPAIGN_KEY)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('campaign') !== CAMPAIGN_KEY) {
      return Response.json({ ok: false, error: 'Campanha inválida.' }, { status: 400 });
    }
    const supabase = getSupabaseAdmin();
    const rows = await loadCampaignLogs(supabase);
    return Response.json({
      ok: true,
      campaignKey: CAMPAIGN_KEY,
      counts: campaignCounts(rows),
      pendingIds: rows.filter((row) => row.status === 'pending').map((row) => row.id),
      failed: rows.filter((row) => row.status === 'failed').map((row) => ({ id: row.id, reason: row.reason })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Falha ao carregar campanha.',
    }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

async function sendCampaignAudio(request, body) {
  const supabase = getSupabaseAdmin();
  const logId = String(body?.campaignLogId || '').trim();
  if (!logId) {
    return Response.json({ ok: false, error: 'Item da campanha não informado.' }, { status: 400 });
  }

  let log = null;
  let sentToWhatsApp = false;
  try {
    const { data: currentLog, error: logError } = await supabase
      .from('whatsapp_audio_campaign_logs')
      .select('id,contact_id,segment,status,message_id,reason')
      .eq('id', logId)
      .eq('campaign_key', CAMPAIGN_KEY)
      .maybeSingle();
    if (logError) throw logError;
    if (!currentLog) return Response.json({ ok: false, error: 'Lead não pertence a esta campanha.' }, { status: 404 });
    log = currentLog;

    if (log.status === 'sent') {
      return Response.json({ ok: true, alreadySent: true, messageId: log.message_id });
    }
    if (log.status === 'skipped') {
      return Response.json({ ok: true, alreadySkipped: true, reason: log.reason || 'Lead já foi pulado.' });
    }
    if (log.status === 'sending') {
      return Response.json({ ok: false, error: 'Este envio já está em processamento.' }, { status: 409 });
    }
    if (log.status === 'failed') {
      return Response.json({ ok: false, error: 'Este envio falhou anteriormente: ' + (log.reason || 'erro desconhecido') }, { status: 409 });
    }

    const { data: claimed, error: claimError } = await supabase
      .from('whatsapp_audio_campaign_logs')
      .update({ status: 'sending', reason: null, updated_at: new Date().toISOString() })
      .eq('id', log.id)
      .eq('status', 'pending')
      .select('id,contact_id,segment')
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return Response.json({ ok: false, error: 'Não consegui reservar este envio. Atualize a página e tente novamente.' }, { status: 409 });
    log = { ...log, ...claimed };

    const { data: contact, error: contactError } = await supabase
      .from('whatsapp_contacts')
      .select('id,profile_name,phone,wa_id,stage,tags,last_message_at')
      .eq('id', log.contact_id)
      .single();
    if (contactError) throw contactError;

    const contactTags = Array.isArray(contact.tags) ? contact.tags : [];
    const expectedTag = SEGMENT_TAG[log.segment];
    const rawRecipient = contact.phone || contact.wa_id;
    const to = getWhatsAppProvider() === 'baileys'
      ? normalizeWhatsAppRecipient(rawRecipient)
      : normalizeWaId(rawRecipient);

    if (!to || ['Venda', 'Perdido'].includes(contact.stage) || !contactTags.includes(expectedTag)) {
      const reason = !to ? 'Número inválido' : 'Lead não está mais elegível para esta campanha';
      await supabase.from('whatsapp_audio_campaign_logs')
        .update({ status: 'skipped', reason, updated_at: new Date().toISOString() })
        .eq('id', log.id);
      return Response.json({ ok: true, skipped: true, reason, contact: { id: contact.id, name: contact.profile_name, phone: to } });
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
      await supabase.from('whatsapp_audio_campaign_logs')
        .update({ status: 'skipped', reason, updated_at: new Date().toISOString() })
        .eq('id', log.id);
      return Response.json({ ok: true, skipped: true, reason, contact: { id: contact.id, name: contact.profile_name, phone: to } });
    }

    const { data: asset, error: assetError } = await supabase
      .from('whatsapp_campaign_audio_assets')
      .select('key,sha256,data_base64')
      .eq('key', log.segment)
      .maybeSingle();
    if (assetError) throw assetError;
    if (!asset?.data_base64) throw new Error('O áudio de ' + log.segment + ' não está salvo.');

    const origin = new URL(request.url).origin;
    const audioUrl = origin + '/api/whatsapp/campaign-audio?key=' + encodeURIComponent(log.segment)
      + '&raw=1&v=' + encodeURIComponent(asset.sha256 || Date.now());

    const result = await sendWhatsAppVoiceByUrl({ to, audioUrl });
    sentToWhatsApp = true;
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

    return Response.json({
      ok: true,
      sent: true,
      messageId,
      contact: { id: contact.id, name: contact.profile_name, phone: to, segment: log.segment },
    });
  } catch (error) {
    if (log?.id) {
      const reason = (sentToWhatsApp ? 'Áudio pode ter sido enviado; não repetir automaticamente. ' : '')
        + (error instanceof Error ? error.message : 'Falha ao enviar');
      await supabase.from('whatsapp_audio_campaign_logs')
        .update({ status: 'failed', reason, updated_at: new Date().toISOString() })
        .eq('id', log.id)
        .catch(() => {});
    }
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Falha ao enviar áudio da campanha.',
    }, { status: 500 });
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));

  if (body?.campaignLogId) {
    return sendCampaignAudio(request, body);
  }

  const to = getWhatsAppProvider() === 'baileys'
    ? normalizeWhatsAppRecipient(body?.to)
    : normalizeWaId(body?.to);
  const text = String(body?.text || '').trim();
  const audioUrl = String(body?.audioUrl || '').trim();
  const wantsVoice = Boolean(audioUrl);

  if (!to || (!text && !audioUrl)) {
    return Response.json({ ok: false, error: 'Número e conteúdo da mensagem são obrigatórios.' }, { status: 400 });
  }

  if (text && audioUrl) {
    return Response.json({ ok: false, error: 'Envie texto ou áudio por vez.' }, { status: 400 });
  }

  try {
    const result = wantsVoice
      ? await sendWhatsAppVoiceByUrl({ to, audioUrl })
      : await sendWhatsAppText({ to, text });

    const messageId = result?.messages?.[0]?.id || result?.messageId || null;
    const now = new Date().toISOString();
    const supabase = getSupabaseAdmin();
    const contact = await upsertWhatsAppContact(supabase, {
      waId: to,
      source: getWhatsAppProvider() === 'baileys' ? 'WhatsApp Bridge' : 'WhatsApp',
      lastMessageAt: now,
    });

    const { error } = await supabase.from('whatsapp_messages').insert({
      meta_message_id: messageId,
      contact_id: contact.id,
      direction: 'outbound',
      message_type: wantsVoice ? 'audio' : 'text',
      body: wantsVoice ? '🎙️ Mensagem de voz' : text,
      status: 'sent',
      raw_payload: result,
      sent_at: now,
    });

    if (error) throw error;
    return Response.json({
      ok: true,
      messageId,
      contact,
      type: wantsVoice ? 'audio' : 'text',
    });
  } catch (error) {
    const status = [
      'WHATSAPP_NOT_CONFIGURED',
      'WHATSAPP_BRIDGE_NOT_CONFIGURED',
      'BRIDGE_NOT_CONNECTED',
    ].includes(error?.code) ? 503 : 500;

    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Falha ao enviar mensagem.',
    }, { status });
  }
}
