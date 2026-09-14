export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_ID = process.env.META_APP_ID || '1975149819862842';
const VERSION = 'v26.0';

export async function GET() {
  const secret = String(process.env.META_APP_SECRET || '').trim();

  if (!secret) {
    return Response.json(
      { ok: false, valid: false, appId: APP_ID, reason: 'missing_secret' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${VERSION}/${APP_ID}?fields=id,name`,
      {
        headers: { Authorization: `Bearer ${APP_ID}|${secret}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      }
    );
    const payload = await response.json().catch(() => ({}));
    const valid = response.ok && !payload?.error && String(payload?.id || '') === APP_ID;

    return Response.json(
      {
        ok: valid,
        valid,
        appId: APP_ID,
        appName: valid ? payload?.name || null : null,
        errorCode: valid ? null : payload?.error?.code || response.status,
        errorType: valid ? null : payload?.error?.type || null,
      },
      {
        status: valid ? 200 : 502,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch {
    return Response.json(
      { ok: false, valid: false, appId: APP_ID, reason: 'meta_unreachable' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
