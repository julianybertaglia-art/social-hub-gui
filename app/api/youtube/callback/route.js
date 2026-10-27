import crypto from 'node:crypto';
import { getSupabaseAdmin } from '../../whatsapp/lib';
import {
  YOUTUBE_REDIRECT_URI, YOUTUBE_WORKSPACE, digestOauthState,
  encryptYoutubeToken, exchangeYoutubeCode, getAuthorizedYoutubeChannel,
} from '../../../lib/youtube-oauth.mjs';

export const dynamic = 'force-dynamic';

function finish(result) {
  const url = new URL('/youtube', YOUTUBE_REDIRECT_URI);
  url.searchParams.set('connection', result);
  // Response.redirect() creates immutable headers in the Fetch API.
  // Build the redirect with all headers up front so authorization does not end with HTTP 500.
  return new Response(null, {
    status: 303,
    headers: {
      Location: url.toString(),
      'Cache-Control': 'private, no-store',
      'Set-Cookie': 'tide_youtube_oauth=; Path=/api/youtube; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    },
  });
}
function stateMatches(received, saved) {
  const a = Buffer.from(received || ''), b = Buffer.from(saved || '');
  return a.length === b.length && a.length >= 30 && crypto.timingSafeEqual(a, b);
}

export async function GET(request) {
  const query = new URL(request.url).searchParams;
  const state = query.get('state') || '';
  const cookieState = request.cookies.get('tide_youtube_oauth')?.value || '';
  if (!stateMatches(state, cookieState)) return finish('invalid_state');
  if (query.get('error')) return finish('denied');
  const code = query.get('code');
  if (!code || code.length > 4096) return finish('error');

  try {
    const db = getSupabaseAdmin();
    // Atomic one-time redemption: only one request can use this state.
    const { data: pending, error } = await db.from('youtube_oauth_pending')
      .update({ consumed_at: new Date().toISOString() })
      .eq('state_hash', digestOauthState(state))
      .eq('workspace_id', YOUTUBE_WORKSPACE)
      .is('consumed_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('owner_user_id').maybeSingle();
    if (error || !pending) return finish('expired');

    const tokens = await exchangeYoutubeCode(code);
    const channel = await getAuthorizedYoutubeChannel(tokens.accessToken);
    const encryptedAccess = encryptYoutubeToken(tokens.accessToken);
    const encryptedRefresh = encryptYoutubeToken(tokens.refreshToken);
    const { error: savingError } = await db.from('youtube_channel_connections').upsert({
      owner_user_id: pending.owner_user_id, workspace_id: YOUTUBE_WORKSPACE,
      channel_id: channel.id, channel_title: channel.title, channel_thumbnail: channel.thumbnail,
      access_token_ciphertext: encryptedAccess, refresh_token_ciphertext: encryptedRefresh,
      oauth_scopes: tokens.scopes,
      access_expires_at: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
      connected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_user_id,workspace_id' });
    if (savingError) return finish('save_error');
    return finish('connected');
  } catch (error) {
    console.error('YouTube OAuth callback failed:', error instanceof Error ? error.message : 'unknown');
    return finish('error');
  }
}
