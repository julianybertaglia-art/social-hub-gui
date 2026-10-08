import { createHash, timingSafeEqual } from 'node:crypto';
import { getMetaCredentials, WHATSAPP_API_VERSION } from '../lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Temporary, read-only diagnostic for the authorized Vital Decor connection.
// It accepts no account IDs and never returns access tokens or app secrets.
const PROBE_HASH = '08dc5e3eb7fe58e526ce50659d86645bf05b6a979e4fc7601b27e6967339317a';
const VITAL_BUSINESS = '1055955574784532';
const VITAL_ACCOUNT = '375840532283022';
const VITAL_PHONE = '5511965765247';

async function inspect(path, token, query = {}) {
  const url = new URL(`https://graph.facebook.com/${WHATSAPP_API_VERSION}/${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) return {
      ok: false, code: data.error?.code || response.status,
      subcode: data.error?.error_subcode || null,
      message: data.error?.message || 'Meta request failed',
      traceId: data.error?.fbtrace_id || null,
    };
    return { ok: true, data };
  } catch {
    return { ok: false, message: 'Meta request timed out' };
  }
}

export async function GET(request) {
  const key = request.headers.get('x-vital-probe-key') || '';
  const digest = createHash('sha256').update(key).digest();
  if (!timingSafeEqual(digest, Buffer.from(PROBE_HASH, 'hex'))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  const meta = await getMetaCredentials();
  if (!meta?.accessToken) return Response.json({ credentialAvailable: false });
  const appId = process.env.META_WHATSAPP_APP_ID || process.env.META_APP_ID || '1975149819862842';
  const secret = process.env.META_WHATSAPP_APP_SECRET || process.env.META_APP_SECRET;
  const [debug, phones, owned] = await Promise.all([
    secret ? inspect('debug_token', `${appId}|${secret}`, { input_token: meta.accessToken })
      : Promise.resolve({ ok: false, message: 'App secret unavailable' }),
    inspect(`${VITAL_ACCOUNT}/phone_numbers`, meta.accessToken, {
      fields: 'id,display_phone_number,verified_name,quality_rating', limit: '100',
    }),
    inspect(`${VITAL_BUSINESS}/owned_whatsapp_business_accounts`, meta.accessToken, {
      fields: 'id,name', limit: '100',
    }),
  ]);
  const phone = phones.ok ? phones.data.data?.find((item) =>
    String(item.display_phone_number || '').replace(/\D/g, '') === VITAL_PHONE) : null;
  const profile = phone ? await inspect(String(phone.id), meta.accessToken, {
    fields: 'id,display_phone_number,verified_name,is_on_biz_app,platform_type,status',
  }) : null;
  return Response.json({
    credentialAvailable: true, credentialSource: meta.source,
    token: debug.ok ? {
      appId: debug.data.data?.app_id, valid: debug.data.data?.is_valid,
      type: debug.data.data?.type, scopes: debug.data.data?.scopes || [],
      vitalAssetGranted: (debug.data.data?.granular_scopes || []).some((scope) =>
        scope.target_ids?.includes(VITAL_ACCOUNT)),
    } : debug,
    accountAccess: phones.ok ? { ok: true, targetFound: Boolean(phone) } : phones,
    phone: profile?.ok ? profile.data : profile,
    ownedAccounts: owned.ok ? { ok: true, accounts: owned.data.data || [] } : owned,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
