import { authorize } from '../../service';
import { fail } from '../../helpers.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    const hostOrigin = request.headers.get('host') ? url.protocol + '//' + request.headers.get('host') : url.origin;
    if (!origin || (origin !== url.origin && origin !== hostOrigin)) throw fail('Origem inválida.', 403);

    const payload = await request.json();
    if (payload?.action !== 'pause') throw fail('Ação não permitida.', 422);
    const { db, ownerId } = await authorize(request);
    const { data, error } = await db.from('workspace_meta_connections')
      .update({ automatic_replies_enabled: false, updated_at: new Date().toISOString() })
      .eq('owner_user_id', ownerId).eq('workspace_id', 'vital-decor')
      .eq('platform', 'instagram').eq('state', 'connected')
      .select('id').maybeSingle();
    if (error || !data) throw fail('A conexão da Vital Decor não foi encontrada.', 409);
    return Response.json({ ok: true, automaticReplies: false }, { headers });
  } catch (error) {
    return Response.json({ error: error.status ? error.message : 'Não foi possível pausar a automação.' },
      { status: error.status || 503, headers });
  }
}
