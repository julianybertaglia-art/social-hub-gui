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
  const participants = Array.isArray(body?.participants) ? body.participants : [];

  if (!subject) {
    return Response.json({ ok: false, error: 'Informe o nome do grupo.' }, { status: 400 });
  }
  if (!participants.length) {
    return Response.json({ ok: false, error: 'Adicione pelo menos um participante.' }, { status: 400 });
  }

  try {
    const group = await createWhatsAppBridgeGroup({ subject, participants });
    return Response.json({ ok: true, group });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Não foi possível criar o grupo.',
    }, { status: 503 });
  }
}
