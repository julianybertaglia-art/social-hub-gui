import { NextResponse } from 'next/server';
import { authorize } from '../../../service';
import { CALLBACK_COOKIE, CALLBACK_URL, unifiedLoginUrl } from '../lib.mjs';
import { resolveAppSecret } from '../credentials.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const origin = new URL(CALLBACK_URL).origin;
  // The single registered Meta redirect points at production. Do not start
  // authentication on preview and accidentally complete it in production.
  if (new URL(request.url).origin !== origin || request.headers.get('origin') !== origin) {
    return NextResponse.json({ error: 'Inicie a autorização no domínio oficial do TidePlace.' }, { status: 403 });
  }
  try {
    const { db, ownerId } = await authorize(request);
    // Fail before opening Meta if neither stored secret matches this app ID.
    // Prevents repeated browser authorization attempts while the server is misconfigured.
    await resolveAppSecret();
    const { data, error } = await db.from('workspace_meta_connection_sessions').insert({
      owner_user_id: ownerId,
      workspace_id: 'vital-decor',
      platform: 'instagram',
      candidates: [],
      status: 'prepared',
      expires_at: new Date(Date.now() + 8 * 60 * 1000).toISOString(),
    }).select('id').single();
    if (error || !data?.id) throw new Error('state_storage_failed');

    const response = NextResponse.json({ loginUrl: unifiedLoginUrl(data.id) }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
    response.cookies.set(CALLBACK_COOKIE, data.id, {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/api/vital-connections/instagram/unified/callback',
      maxAge: 8 * 60,
    });
    return response;
  } catch (error) {
    const credentialError = ['app_credentials', 'secret_missing'].includes(error?.reason);
    return NextResponse.json({
      error: credentialError
        ? 'O aplicativo Meta do TidePlace ainda não passou na validação do servidor. Não repita o login: é necessário corrigir a credencial do aplicativo na Vercel.'
        : error?.status ? error.message : 'Não foi possível iniciar o login seguro do Instagram.',
      ...(credentialError ? { reason: error.reason, code: error.metaCode || null } : {}),
    }, { status: error?.status || 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
