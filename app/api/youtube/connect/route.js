import { getSupabaseAdmin } from '../../whatsapp/lib';
import { bearerToken, connectionOwner } from '../../vital-connections/helpers.mjs';
import { YOUTUBE_WORKSPACE, buildYoutubeAuthUrl, digestOauthState, newOauthState } from '../../../lib/youtube-oauth.mjs';

export const dynamic = 'force-dynamic';
const noCache = { 'Cache-Control': 'private, no-store' };

export async function POST(request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return Response.json({ error: 'Origem inválida.' }, { status: 403, headers: noCache });
    }
    const db = getSupabaseAdmin();
    const ownerId = await connectionOwner(db, bearerToken(request));
    const state = newOauthState();
    const url = buildYoutubeAuthUrl(state);
    const { error } = await db.from('youtube_oauth_pending').insert({
      state_hash: digestOauthState(state), owner_user_id: ownerId, workspace_id: YOUTUBE_WORKSPACE,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (error) throw new Error('Não foi possível iniciar a autorização do YouTube.');
    return Response.json({ authorizationUrl: url }, {
      headers: { ...noCache,
        'Set-Cookie': 'tide_youtube_oauth=' + encodeURIComponent(state) +
          '; Path=/api/youtube; HttpOnly; Secure; SameSite=Lax; Max-Age=600',
      },
    });
  } catch (error) {
    return Response.json({ error: error.status ? error.message : 'Não foi possível iniciar a conexão. Tente novamente.' },
      { status: error.status || 503, headers: noCache });
  }
}
