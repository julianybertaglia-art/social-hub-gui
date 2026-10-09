import { authorize, graph } from '../service';
import { connectedInstagram, instagramMetrics } from './metrics.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const { db, ownerId } = await authorize(request);
    const connection = await connectedInstagram(db, ownerId);
    return Response.json(await instagramMetrics(connection, graph), { headers });
  } catch (error) {
    return Response.json({ error: error.status ? error.message : 'Não foi possível carregar as métricas da Vital Decor.' },
      { status: error.status || 503, headers });
  }
}
