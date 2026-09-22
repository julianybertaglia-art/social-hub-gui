import {
  addWhatsAppBridgeGroupParticipants,
  createWhatsAppBridgeGroup,
  getSupabaseAdmin,
  getWhatsAppBridgeGroups,
  isWhatsAppBridgeConfigured,
} from '../lib';

export const dynamic = 'force-dynamic';

function unavailable() {
  return Response.json({
    ok: false,
    error: 'A conexão auxiliar de grupos ainda não está configurada.',
  }, { status: 503 });
}

export async function GET() {
  if (!isWhatsAppBridgeConfigured()) return unavailable();

  try {
    const result = await getWhatsAppBridgeGroups();
    const groups = Array.isArray(result?.groups) ? result.groups : [];
    const syncedAt = new Date().toISOString();

    if (groups.length) {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.from('whatsapp_groups').upsert(
        groups.map((group) => ({
          jid: group.jid,
          name: group.name || 'Grupo sem nome',
          description: group.description || null,
          participant_count: Number(group.participants || 0),
          owner_jid: group.owner || null,
          last_synced_at: syncedAt,
          updated_at: syncedAt,
        })),
        { onConflict: 'jid' }
      );

      if (error) throw error;
    }

    return Response.json({ ok: true, groups, syncedAt });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Não foi possível carregar os grupos.',
    }, { status: 503 });
  }
}

export async function POST(request) {
  if (!isWhatsAppBridgeConfigured()) return unavailable();

  const body = await request.json().catch(() => ({}));
  const subject = String(body?.subject || '').trim();
  const jid = String(body?.jid || '').trim();
  const action = String(body?.action || '').trim();
  let participants = Array.isArray(body?.participants) ? body.participants : [];
  const eventKey = String(body?.eventKey || '').trim();
  const offset = Math.max(0, Number(body?.offset || 0));
  const limit = 1;

  try {
    if (action === 'add-next') {
      if (!eventKey) {
        return Response.json({ ok: false, error: 'Evento inválido.' }, { status: 400 });
      }

      const supabase = getSupabaseAdmin();
      const { data: job, error: jobError } = await supabase
        .from('event_group_jobs')
        .select('group_jid, next_offset')
        .eq('event_key', eventKey)
        .single();

      if (jobError) throw jobError;

      const currentOffset = Math.max(0, Number(job?.next_offset || 0));
      const { data: rows, error: participantError } = await supabase
        .from('event_participants')
        .select('phone')
        .eq('event_key', eventKey)
        .eq('active', true)
        .not('phone', 'is', null)
        .order('source_row', { ascending: true })
        .range(currentOffset, currentOffset);

      if (participantError) throw participantError;

      const phone = rows?.[0]?.phone || null;
      if (!phone) {
        return Response.json({ ok: true, done: true, nextOffset: currentOffset });
      }

      const result = await addWhatsAppBridgeGroupParticipants({
        jid: job.group_jid,
        participants: [phone],
      });

      const status = String(result?.results?.[0]?.status || 'unknown');

      const { error: updateError } = await supabase
        .from('event_group_jobs')
        .update({
          next_offset: currentOffset + 1,
          last_status: status,
          last_phone: phone,
          updated_at: new Date().toISOString(),
        })
        .eq('event_key', eventKey);

      if (updateError) throw updateError;

      return Response.json({
        ok: true,
        done: false,
        offset: currentOffset,
        nextOffset: currentOffset + 1,
        status,
        result,
      });
    }

    if (!participants.length && eventKey) {
      const supabase = getSupabaseAdmin();
      let query = supabase
        .from('event_participants')
        .select('phone')
        .eq('event_key', eventKey)
        .eq('active', true)
        .not('phone', 'is', null)
        .order('source_row', { ascending: true });

      if (action === 'add' && jid) {
        query = query.range(offset, offset + limit - 1);
      }

      const { data, error } = await query;
      if (error) throw error;
      participants = (data || []).map((row) => row.phone).filter(Boolean);
    }

    if (action === 'add') {
      if (!jid) return Response.json({ ok: false, error: 'Grupo inválido.' }, { status: 400 });
      if (!participants.length) return Response.json({ ok: false, error: 'Nenhum participante neste lote.' }, { status: 400 });
      const result = await addWhatsAppBridgeGroupParticipants({ jid, participants });
      return Response.json({ ok: true, result, offset, limit });
    }

    if (!subject) {
      return Response.json({ ok: false, error: 'Informe o nome do grupo.' }, { status: 400 });
    }
    if (!participants.length) {
      return Response.json({ ok: false, error: 'Adicione pelo menos um participante.' }, { status: 400 });
    }

    const group = await createWhatsAppBridgeGroup({ subject, participants });
    return Response.json({ ok: true, group });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : String(error?.message || error?.details || error?.hint || JSON.stringify(error || {}));
    return Response.json({
      ok: false,
      error: message || 'Não foi possível atualizar o grupo.',
    }, { status: 503 });
  }
}
