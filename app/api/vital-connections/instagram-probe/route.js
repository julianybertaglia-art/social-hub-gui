import { createHash, timingSafeEqual } from 'node:crypto';
import { getSupabaseAdmin } from '../../whatsapp/lib';
import { graph } from '../service';
import { connectedInstagram, instagramMetrics } from '../instagram/metrics.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const HASH = '6a81ec81943f64a1e38376518818713b865899de08e56ea62845adbe197f4c35';
const EXPIRES = 1791548225904;

export async function GET(request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const digest = createHash('sha256').update(request.headers.get('x-vital-metrics-probe-key') || '').digest();
  if (Date.now() > EXPIRES || !timingSafeEqual(digest, Buffer.from(HASH, 'hex'))) {
    return Response.json({ error: 'Forbidden' }, { status: 403, headers });
  }
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from('workspace_meta_connections').select('owner_user_id')
      .eq('workspace_id', 'vital-decor').eq('platform', 'instagram')
      .eq('external_account_id', '17841439121395170').eq('username', 'vitaldecor_').eq('state', 'connected').single();
    if (error || !data) throw new Error('Exact Vital connection unavailable');
    const connection = await connectedInstagram(db, data.owner_user_id);
    return Response.json(await instagramMetrics(connection, graph), { headers });
  } catch (error) {
    return Response.json({ error: error.status ? error.message : 'Diagnostic failed' }, { status: error.status || 503, headers });
  }
}

