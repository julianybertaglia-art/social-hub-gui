import { getSupabaseAdmin } from '../../whatsapp/lib';
import { bearerToken, connectionOwner } from '../../vital-connections/helpers.mjs';
import { YOUTUBE_WORKSPACE, youtubePublicStatus } from '../../../lib/youtube-oauth.mjs';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

async function auth(request) {
  const db = getSupabaseAdmin();
  const ownerId = await connectionOwner(db, bearerToken(request));
  return { db, ownerId };
}

export async function GET(request) {
  try {
    const { db, ownerId } = await auth(request);
    const { data, error } = await db.from('youtube_channel_connections')
      .select('channel_id,channel_title,channel_thumbnail,connected_at,access_expires_at')
      .eq('owner_user_id', ownerId).eq('workspace_id', YOUTUBE_WORKSPACE).maybeSingle();
    if (error) throw new Error('Não foi possível consultar a conexão.');
    return Response.json({ ...youtubePublicStatus(data), workspace: YOUTUBE_WORKSPACE }, { headers });
  } catch (error) {
    return Response.json({ error: error.status ? error.message : 'Não foi possível consultar o YouTube.' },
      { status: error.status || 503, headers });
  }
}

export async function DELETE(request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return Response.json({ error: 'Origem inválida.' }, { status: 403, headers });
    const { db, ownerId } = await auth(request);
    const { error } = await db.from('youtube_channel_connections').delete()
      .eq('owner_user_id', ownerId).eq('workspace_id', YOUTUBE_WORKSPACE);
    if (error) throw new Error('Não foi possível desconectar o YouTube.');
    // A revogação no Google pode ser feita pelo proprietário em myaccount.google.com/permissions.
    return Response.json({ connected: false }, { headers });
  } catch (error) {
    return Response.json({ error: error.status ? error.message : 'Não foi possível desconectar o YouTube.' },
      { status: error.status || 503, headers });
  }
}
