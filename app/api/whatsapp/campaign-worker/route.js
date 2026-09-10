import { getSupabaseAdmin, normalizeWhatsAppRecipient } from '../lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CAMPAIGN_KEY = 'audio-gui-2026-09-10-imersao-v2';
const PERSONAL_AUDIO_TAG = 'Áudio Gui personalizado · 08/09';
const SENT_TAG = 'Áudio Gui enviado · Imersão 10/09';
const SEGMENT_TAG = {
  seller: 'Áudio Gui · Seller',
  iniciante: 'Áudio Gui · Iniciante',
};

function runnerAuthorized(request) {
  const expected = process.env.WHATSAPP_BRIDGE_WEBHOOK_TOKEN || process.env.WHATSAPP_BRIDGE_TOKEN;
  if (!expected) return false;
  return request.headers.get('authorization') === 'Bearer ' + expected;
}

function campaignCounts(rows = []) {
  const result = {
    total: rows.length,
    pending: 0,
    sending: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    seller: { total: 0, pending: 0, sent: 0 },
    iniciante: { total: 0, pending: 0, sent: 0 },
  };

  for (const row of rows) {
    if (typeof result[row.status] === 'number') result[row.status] += 1;
    if (result[row.segment]) {
      result[row.segment].total += 1;
      if (row.status === 'pending') result[row.segment].pending += 1;
      if (row.status === 'sent') result[row.segment].sent += 1;
    }
  }

  return result;
}

async function loadLogs(supabase) {
  const { data, error } = await supabase
    .from('whatsapp_audio_campaign_logs')
    .select('id,contact_id,segment,status,message_id,reason,sent_at,created_at,updated_at')
    .eq('campaign_key', CAMPAIGN_KEY)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function loadControl(supabase) {
  const { data, error } = await supabase
    .from('whatsapp_audio_campaign_control')
    .select('*')
    .eq('campaign_key', CAMPAIGN_KEY)
    .maybeSingle();
  if (error) throw error;
  return data || {
    campaign_key: CAMPAIGN_KEY,
    status: 'paused',
    interval_min_seconds: 45,
    interval_max_seconds: 75,
    next_send_at: null,
  };
}

async function summary(supabase) {
  const [logs, control] = await Promise.all([loadLogs(supabase), loadControl(supabase)]);
  return {
    ok: true,
    campaignKey: CAMPAIGN_KEY,
    counts: campaignCounts(logs),
    control: {
      status: control.status,
      intervalMinSeconds: control.interval_min_seconds,
      intervalMaxSeconds: control.interval_max_seconds,
      nextSendAt: control.next_send_at,
      startedAt: control.started_at,
      completedAt: control.completed_at,
      lastError: control.last_error,
    },
  };
}

async function skipLog(supabase, id, reason) {
  await supabase
    .from('whatsapp_audio_campaign_logs')
    .update({ status: 'skipped', reason, updated_at: new Date().toISOString() })
    .eq('id', id);
}

async function nextJob(request, supabase) {
  if (!runnerAuthorized(request)) {
    return Response.json({ ok: false, error: 'Não autorizado.' }, { status: 401 });
  }

  const control = await loadControl(supabase);
  if (control.status !== 'running') {
    return Response.json({ ok: true, idle: true, status: control.status });
  }

  if (control.next_send_at && Date.parse(control.next_send_at) > Date.now()) {
    return Response.json({ ok: true, idle: true, status: 'waiting', nextSendAt: control.next_send_at });
  }

  const staleCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: stale } = await supabase
    .from('whatsapp_audio_campaign_logs')
    .select('id')
    .eq('campaign_key', CAMPAIGN_KEY)
    .eq('status', 'sending')
    .lt('updated_at', staleCutoff);

  if (stale?.length) {
    await supabase
      .from('whatsapp_audio_campaign_logs')
      .update({ status: 'failed', reason: 'Envio ficou sem confirmação; revisar antes de repetir.', updated_at: new Date().toISOString() })
      .in('id', stale.map((item) => item.id));
    await supabase
      .from('whatsapp_audio_campaign_control')
      .update({ status: 'error', last_error: 'Há envio sem confirmação. Campanha pausada por segurança.', updated_at: new Date().toISOString() })
      .eq('campaign_key', CAMPAIGN_KEY);
    return Response.json({ ok: true, idle: true, status: 'error' });
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data: rows, error: rowError } = await supabase
      .from('whatsapp_audio_campaign_logs')
      .select('id,contact_id,segment,status')
      .eq('campaign_key', CAMPAIGN_KEY)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);
    if (rowError) throw rowError;

    const log = rows?.[0];
    if (!log) {
      await supabase
        .from('whatsapp_audio_campaign_control')
        .update({ status: 'completed', completed_at: new Date().toISOString(), next_send_at: null, updated_at: new Date().toISOString() })
        .eq('campaign_key', CAMPAIGN_KEY);
      return Response.json({ ok: true, done: true, status: 'completed' });
    }

    const { data: contact, error: contactError } = await supabase
      .from('whatsapp_contacts')
      .select('id,profile_name,phone,wa_id,stage,tags,last_message_at')
      .eq('id', log.contact_id)
      .single();
    if (contactError) throw contactError;

    const tags = Array.isArray(contact.tags) ? contact.tags : [];
    const hasImersaoInterest = tags.includes('Imersão') || tags.includes('Mentoria + Imersão');
    const correctSegment = tags.includes(SEGMENT_TAG[log.segment]);
    const recipient = normalizeWhatsAppRecipient(contact.phone || contact.wa_id);

    let skipReason = '';
    if (!recipient) skipReason = 'Número inválido';
    else if (['Venda', 'Perdido'].includes(contact.stage)) skipReason = 'Lead já não está elegível';
    else if (!hasImersaoInterest) skipReason = 'Interesse não é Imersão';
    else if (tags.includes(PERSONAL_AUDIO_TAG)) skipReason = 'Já recebeu áudio personalizado do Gui';
    else if (!correctSegment) skipReason = 'Segmentação do áudio não confere';

    if (!skipReason) {
      const { data: latestMessages, error: latestError } = await supabase
        .from('whatsapp_messages')
        .select('direction,sent_at')
        .eq('contact_id', contact.id)
        .order('sent_at', { ascending: false })
        .limit(1);
      if (latestError) throw latestError;
      if (latestMessages?.[0]?.direction === 'inbound') {
        skipReason = 'Lead respondeu e precisa de atendimento';
      }
    }

    if (skipReason) {
      await skipLog(supabase, log.id, skipReason);
      continue;
    }

    const { data: asset, error: assetError } = await supabase
      .from('whatsapp_campaign_audio_assets')
      .select('key,sha256,data_base64')
      .eq('key', log.segment)
      .maybeSingle();
    if (assetError) throw assetError;
    if (!asset?.data_base64) {
      await skipLog(supabase, log.id, 'Áudio do segmento não está salvo');
      continue;
    }

    const { data: claimed, error: claimError } = await supabase
      .from('whatsapp_audio_campaign_logs')
      .update({ status: 'sending', reason: null, updated_at: new Date().toISOString() })
      .eq('id', log.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) continue;

    const origin = new URL(request.url).origin;
    const audioUrl = origin
      + '/api/whatsapp/campaign-audio?key=' + encodeURIComponent(log.segment)
      + '&raw=1&v=' + encodeURIComponent(asset.sha256 || Date.now());

    return Response.json({
      ok: true,
      job: {
        logId: log.id,
        to: recipient,
        segment: log.segment,
        audioUrl,
      },
    });
  }

  return Response.json({ ok: true, idle: true, status: 'no-eligible-job' });
}

async function recordResult(request, body, supabase) {
  if (!runnerAuthorized(request)) {
    return Response.json({ ok: false, error: 'Não autorizado.' }, { status: 401 });
  }

  const logId = String(body?.logId || '').trim();
  if (!logId) return Response.json({ ok: false, error: 'Item da campanha não informado.' }, { status: 400 });

  const { data: log, error: logError } = await supabase
    .from('whatsapp_audio_campaign_logs')
    .select('id,contact_id,segment,status')
    .eq('id', logId)
    .eq('campaign_key', CAMPAIGN_KEY)
    .maybeSingle();
  if (logError) throw logError;
  if (!log) return Response.json({ ok: false, error: 'Item não encontrado.' }, { status: 404 });

  const now = new Date().toISOString();

  if (!body?.success) {
    const reason = String(body?.error || 'Falha no envio pelo WhatsApp').slice(0, 500);
    await supabase.from('whatsapp_audio_campaign_logs')
      .update({ status: 'failed', reason, updated_at: now })
      .eq('id', log.id);
    await supabase.from('whatsapp_audio_campaign_control')
      .update({ status: 'error', last_error: reason, updated_at: now })
      .eq('campaign_key', CAMPAIGN_KEY);
    return Response.json({ ok: true, paused: true });
  }

  const messageId = String(body?.messageId || '').trim() || null;
  const { data: contact, error: contactError } = await supabase
    .from('whatsapp_contacts')
    .select('id,tags')
    .eq('id', log.contact_id)
    .single();
  if (contactError) throw contactError;

  const tags = Array.isArray(contact.tags) ? contact.tags : [];
  const nextTags = tags.includes(SENT_TAG) ? tags : [...tags, SENT_TAG];

  if (messageId) {
    const { error: messageError } = await supabase
      .from('whatsapp_messages')
      .upsert({
        meta_message_id: messageId,
        contact_id: contact.id,
        direction: 'outbound',
        message_type: 'audio',
        body: '🎙️ Áudio do Gui · Imersão 10/09',
        status: 'sent',
        raw_payload: { source: 'railway_campaign_runner', campaign_key: CAMPAIGN_KEY, segment: log.segment },
        sent_at: now,
      }, { onConflict: 'meta_message_id', ignoreDuplicates: true });
    if (messageError) throw messageError;
  }

  await supabase.from('whatsapp_contacts')
    .update({ tags: nextTags, last_message_at: now, updated_at: now })
    .eq('id', contact.id);

  await supabase.from('whatsapp_audio_campaign_logs')
    .update({ status: 'sent', message_id: messageId, sent_at: now, reason: null, updated_at: now })
    .eq('id', log.id);

  const { count: pendingCount, error: countError } = await supabase
    .from('whatsapp_audio_campaign_logs')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_key', CAMPAIGN_KEY)
    .eq('status', 'pending');
  if (countError) throw countError;

  const control = await loadControl(supabase);
  if ((pendingCount || 0) === 0) {
    await supabase.from('whatsapp_audio_campaign_control')
      .update({ status: 'completed', completed_at: now, next_send_at: null, last_error: null, updated_at: now })
      .eq('campaign_key', CAMPAIGN_KEY);
  } else {
    const min = Number(control.interval_min_seconds || 45);
    const max = Math.max(min, Number(control.interval_max_seconds || 75));
    const delay = Math.floor(min + Math.random() * (max - min + 1));
    const nextSendAt = new Date(Date.now() + delay * 1000).toISOString();
    await supabase.from('whatsapp_audio_campaign_control')
      .update({ status: 'running', next_send_at: nextSendAt, last_error: null, updated_at: now })
      .eq('campaign_key', CAMPAIGN_KEY);
  }

  return Response.json({ ok: true, recorded: true });
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    return Response.json(await summary(supabase), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Falha ao carregar campanha.' }, { status: 500 });
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || '').toLowerCase();
  const supabase = getSupabaseAdmin();

  try {
    if (action === 'next') return nextJob(request, supabase);
    if (action === 'result') return recordResult(request, body, supabase);

    if (action === 'start') {
      const current = await summary(supabase);
      if (!current.counts.pending) {
        return Response.json({ ok: false, error: 'Não há leads pendentes nesta campanha.' }, { status: 409 });
      }
      const now = new Date().toISOString();
      await supabase.from('whatsapp_audio_campaign_control')
        .upsert({
          campaign_key: CAMPAIGN_KEY,
          status: 'running',
          interval_min_seconds: 45,
          interval_max_seconds: 75,
          next_send_at: now,
          started_at: now,
          completed_at: null,
          last_error: null,
          updated_at: now,
        }, { onConflict: 'campaign_key' });
      return Response.json(await summary(supabase));
    }

    if (action === 'pause') {
      await supabase.from('whatsapp_audio_campaign_control')
        .update({ status: 'paused', next_send_at: null, updated_at: new Date().toISOString() })
        .eq('campaign_key', CAMPAIGN_KEY);
      return Response.json(await summary(supabase));
    }

    return Response.json({ ok: false, error: 'Ação inválida.' }, { status: 400 });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Falha na campanha.' }, { status: 500 });
  }
}
