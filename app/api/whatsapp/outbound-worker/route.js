import { getSupabaseAdmin, normalizeWhatsAppRecipient } from '../lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function authorized(request) {
  const expected = process.env.WHATSAPP_BRIDGE_WEBHOOK_TOKEN || process.env.WHATSAPP_BRIDGE_TOKEN;
  if (!expected) return false;
  return request.headers.get('authorization') === 'Bearer ' + expected;
}

async function nextJob(request, supabase) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: 'Não autorizado.' }, { status: 401 });
  }

  const now = new Date().toISOString();
  const { data: rows, error } = await supabase
    .from('whatsapp_outbound_queue')
    .select('id,contact_id,batch_key,message_type,segment,text_body,status,not_before')
    .eq('status', 'pending')
    .lte('not_before', now)
    .order('not_before', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw error;

  const row = rows?.[0];
  if (!row) return Response.json({ ok: true, idle: true });

  const { data: contact, error: contactError } = await supabase
    .from('whatsapp_contacts')
    .select('id,profile_name,phone,wa_id,stage,tags')
    .eq('id', row.contact_id)
    .single();
  if (contactError) throw contactError;

  const tags = Array.isArray(contact.tags) ? contact.tags : [];
  let reason = '';
  if (['Venda', 'Perdido'].includes(contact.stage)) reason = 'Lead não está mais elegível';
  if (tags.includes('Áudio Gui personalizado · 08/09') && row.message_type === 'audio') reason = 'Já recebeu áudio personalizado do Gui';

  const recipient = normalizeWhatsAppRecipient(contact.phone || contact.wa_id);
  if (!recipient) reason = 'Número inválido';

  if (reason) {
    await supabase.from('whatsapp_outbound_queue')
      .update({ status: 'skipped', reason, updated_at: now })
      .eq('id', row.id);
    return Response.json({ ok: true, skipped: true, reason });
  }

  let audioUrl = null;
  if (row.message_type === 'audio') {
    if (!['seller', 'iniciante'].includes(row.segment)) {
      await supabase.from('whatsapp_outbound_queue')
        .update({ status: 'skipped', reason: 'Segmento do áudio inválido', updated_at: now })
        .eq('id', row.id);
      return Response.json({ ok: true, skipped: true, reason: 'Segmento do áudio inválido' });
    }

    const { data: asset, error: assetError } = await supabase
      .from('whatsapp_campaign_audio_assets')
      .select('sha256,data_base64')
      .eq('key', row.segment)
      .maybeSingle();
    if (assetError) throw assetError;
    if (!asset?.data_base64) {
      await supabase.from('whatsapp_outbound_queue')
        .update({ status: 'skipped', reason: 'Áudio não encontrado', updated_at: now })
        .eq('id', row.id);
      return Response.json({ ok: true, skipped: true, reason: 'Áudio não encontrado' });
    }

    const origin = new URL(request.url).origin;
    audioUrl = origin + '/api/whatsapp/campaign-audio?key=' + encodeURIComponent(row.segment)
      + '&raw=1&v=' + encodeURIComponent(asset.sha256 || Date.now());
  }

  const { data: claimed, error: claimError } = await supabase
    .from('whatsapp_outbound_queue')
    .update({ status: 'sending', reason: null, updated_at: now })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return Response.json({ ok: true, idle: true });

  return Response.json({
    ok: true,
    job: {
      id: row.id,
      to: recipient,
      type: row.message_type,
      text: row.text_body || null,
      audioUrl,
      segment: row.segment || null,
      batchKey: row.batch_key,
    },
  });
}

async function recordResult(request, body, supabase) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: 'Não autorizado.' }, { status: 401 });
  }

  const id = String(body?.id || '').trim();
  if (!id) return Response.json({ ok: false, error: 'Item não informado.' }, { status: 400 });

  const { data: row, error } = await supabase
    .from('whatsapp_outbound_queue')
    .select('id,contact_id,message_type,segment,batch_key,status')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!row) return Response.json({ ok: false, error: 'Item não encontrado.' }, { status: 404 });

  const now = new Date().toISOString();
  if (!body?.success) {
    const reason = String(body?.error || 'Falha no envio').slice(0, 500);
    await supabase.from('whatsapp_outbound_queue')
      .update({ status: 'failed', reason, updated_at: now })
      .eq('id', id);
    return Response.json({ ok: true });
  }

  const messageId = String(body?.messageId || '').trim() || null;
  const { data: contact, error: contactError } = await supabase
    .from('whatsapp_contacts')
    .select('id,tags')
    .eq('id', row.contact_id)
    .single();
  if (contactError) throw contactError;

  const tags = Array.isArray(contact.tags) ? contact.tags : [];
  const sentTag = row.message_type === 'audio'
    ? 'Áudio Gui enviado · seleção recente 10/09'
    : 'Follow-up recente enviado · 10/09';
  const nextTags = tags.includes(sentTag) ? tags : [...tags, sentTag];

  if (messageId) {
    await supabase.from('whatsapp_messages').upsert({
      meta_message_id: messageId,
      contact_id: contact.id,
      direction: 'outbound',
      message_type: row.message_type,
      body: row.message_type === 'audio' ? '🎙️ Áudio do Gui · seleção recente 10/09' : 'Follow-up enviado pelo Hub',
      status: 'sent',
      raw_payload: { source: 'railway_outbound_queue', batch_key: row.batch_key, segment: row.segment || null },
      sent_at: now,
    }, { onConflict: 'meta_message_id', ignoreDuplicates: true });
  }

  await supabase.from('whatsapp_contacts')
    .update({ tags: nextTags, last_message_at: now, updated_at: now })
    .eq('id', contact.id);

  await supabase.from('whatsapp_outbound_queue')
    .update({ status: 'sent', message_id: messageId, sent_at: now, reason: null, updated_at: now })
    .eq('id', id);

  return Response.json({ ok: true });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || '').toLowerCase();
  const supabase = getSupabaseAdmin();

  try {
    if (action === 'next') return nextJob(request, supabase);
    if (action === 'result') return recordResult(request, body, supabase);
    return Response.json({ ok: false, error: 'Ação inválida.' }, { status: 400 });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Falha na fila de saída.' }, { status: 500 });
  }
}
