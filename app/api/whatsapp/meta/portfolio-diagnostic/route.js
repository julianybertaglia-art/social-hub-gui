export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_ID = process.env.META_APP_ID || '1975149819862842';
const BUSINESS_ID = '1055955574784532';
const API_VERSION = process.env.META_GRAPH_API_VERSION || 'v26.0';

async function graph(path, token) {
  const response = await fetch(`https://graph.facebook.com/${API_VERSION}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok && !payload?.error,
    status: response.status,
    data: payload?.error ? null : payload,
    error: payload?.error ? {
      code: payload.error.code || null,
      subcode: payload.error.error_subcode || null,
      type: payload.error.type || null,
      message: payload.error.message || null,
    } : null,
  };
}

function safeApp(data) {
  if (!data) return null;
  return {
    id: data.id || null,
    name: data.name || null,
    company: data.company || null,
    appDomains: data.app_domains || [],
    link: data.link || null,
  };
}

function safeBusiness(data) {
  if (!data) return null;
  return {
    id: data.id || null,
    name: data.name || null,
    verificationStatus: data.verification_status || null,
    ownedApps: Array.isArray(data?.owned_apps?.data)
      ? data.owned_apps.data.map((app) => ({ id: app.id || null, name: app.name || null }))
      : [],
  };
}

export async function GET() {
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    return Response.json({ ok: false, error: 'META_APP_SECRET ausente.' }, { status: 503 });
  }

  const appToken = `${APP_ID}|${secret}`;
  const [appResult, businessResult, tokenResult] = await Promise.all([
    graph(`${APP_ID}?fields=id,name,company,app_domains,link`, appToken),
    graph(`${BUSINESS_ID}?fields=id,name,verification_status,owned_apps.limit(100){id,name}`, appToken),
    graph(`debug_token?input_token=${encodeURIComponent(appToken)}`, appToken),
  ]);

  const tokenData = tokenResult.data?.data || null;
  return Response.json({
    ok: appResult.ok && tokenResult.ok,
    expected: { appId: APP_ID, businessId: BUSINESS_ID },
    app: { ...appResult, data: safeApp(appResult.data) },
    business: { ...businessResult, data: safeBusiness(businessResult.data) },
    appToken: {
      ok: tokenResult.ok,
      status: tokenResult.status,
      error: tokenResult.error,
      data: tokenData ? {
        appId: tokenData.app_id || null,
        application: tokenData.application || null,
        isValid: tokenData.is_valid === true,
        type: tokenData.type || null,
      } : null,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
