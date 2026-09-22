import {
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
  let participants = Array.isArray(body?.participants) ? body.participants : [];
  const eventKey = String(body?.eventKey || '').trim();

  if (!subject) {
    return Response.json({ ok: false, error: 'Informe o nome do grupo.' }, { status: 400 });
  }

  try {
    if (!participants.length && eventKey) {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('event_participants')
        .select('phone')
        .eq('event_key', eventKey)
        .eq('active', true)
        .not('phone', 'is', null)
        .order('source_row', { ascending: true });

      if (error) throw error;
      participants = (data || []).map((row) => row.phone).filter(Boolean);
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
      error: message || 'Não foi possível criar o grupo.',
    }, { status: 503 });
  }
}
