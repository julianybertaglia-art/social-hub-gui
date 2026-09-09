import {
  getSupabaseAdmin,
  getWhatsAppBridgeGroups,
  getWhatsAppProvider,
} from '../lib';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (getWhatsAppProvider() !== 'baileys') {
    return Response.json({
      ok: false,
      error: 'A consulta de grupos está disponível quando a ponte Baileys está ativa.',
    }, { status: 409 });
  }

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
