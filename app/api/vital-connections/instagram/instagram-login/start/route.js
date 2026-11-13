import { NextResponse } from 'next/server';
import { authorize } from '../../../service';
import { IG_LOGIN_CALLBACK, IG_LOGIN_COOKIE, directInstagramLoginConfigured, instagramBusinessLoginUrl } from '../lib.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const targetOrigin = new URL(IG_LOGIN_CALLBACK).origin;
  if (new URL(request.url).origin !== targetOrigin || request.headers.get('origin') !== targetOrigin) {
    return NextResponse.json({ error: 'A autorização deve começar no domínio oficial.' }, { status: 403 });
  }
  try {
    const { db, ownerId } = await authorize(request);
    if (!directInstagramLoginConfigured()) {
      return NextResponse.json({ error: 'O Login direto do Instagram ainda não foi configurado no aplicativo Meta e na Vercel.' }, { status: 409 });
    }
    const { data, error } = await db.from('workspace_meta_connection_sessions').insert({
      owner_user_id: ownerId, workspace_id: 'vital-decor', platform: 'instagram',
      candidates: [], status: 'prepared',
      expires_at: new Date(Date.now() + 8 * 60 * 1000).toISOString(),
    }).select('id').single();
    if (error || !data?.id) throw new Error('failed_to_save_state');
    const response = NextResponse.json({
      loginUrl: instagramBusinessLoginUrl(data.id, process.env.META_VITAL_IG_APP_ID),
    }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(IG_LOGIN_COOKIE, data.id, {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/api/vital-connections/instagram/instagram-login/callback', maxAge: 480,
    });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error?.status ? error.message : 'Não foi possível iniciar a conexão do Instagram.' },
      { status: error?.status || 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
