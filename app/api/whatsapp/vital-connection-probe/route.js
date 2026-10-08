import { createHash, timingSafeEqual } from 'node:crypto';
import { getMetaCredentials, getSupabaseAdmin, WHATSAPP_API_VERSION } from '../lib';
import { commitConnection, readStatus } from '../../vital-connections/service';
import { validAppToken } from '../../vital-connections/helpers.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Temporary diagnostic and one-account completion of the authorized connection.
// It accepts no account IDs and never returns access tokens or app secrets.
const PROBE_HASH = '53d0da7b499f6bb334f065cc4ffbefff6f5e57ee0b295e7280e2a4ae754089c8';
const PROBE_EXPIRES_AT = 1791492767494;
const VITAL_BUSINESS = '1055955574784532';
const VITAL_ACCOUNT = '375840532283022';
const VITAL_PHONE = '5511965765247';
const VITAL_PHONE_ID = '392519183951498';
const VITAL_INSTAGRAM_ID = '17841439121395170';

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

export async function POST(request) {
  const digest = createHash('sha256').update(request.headers.get('x-vital-probe-key') || '').digest();
  const headers = { 'Cache-Control': 'no-store' };
  if (Date.now() > PROBE_EXPIRES_AT || !timingSafeEqual(digest, Buffer.from(PROBE_HASH, 'hex'))) {
    return Response.json({ error: 'Forbidden' }, { status: 403, headers });
  }
  const body = await request.json().catch(() => ({}));
  if (body.action !== 'finish_vital_connection' || Object.keys(body).length !== 1) {
    return Response.json({ error: 'Invalid fixed-account action' }, { status: 400, headers });
  }
  const meta = await getMetaCredentials();
  const appId = process.env.META_WHATSAPP_APP_ID || process.env.META_APP_ID || '1975149819862842';
  const secret = process.env.META_WHATSAPP_APP_SECRET || process.env.META_APP_SECRET;
  if (!meta?.accessToken || !secret || String(meta.phoneNumberId) === VITAL_PHONE_ID) {
    return Response.json({ error: 'Primary credentials unavailable or conflict' }, { status: 409, headers });
  }
  const [debug, owned, phone] = await Promise.all([
    inspect('debug_token', `${appId}|${secret}`, { input_token: meta.accessToken }),
    inspect(`${VITAL_BUSINESS}/owned_whatsapp_business_accounts`, meta.accessToken, { fields: 'id,name', limit: '100' }),
    inspect(VITAL_PHONE_ID, meta.accessToken, { fields: 'id,display_phone_number,verified_name,is_on_biz_app,platform_type,status' }),
  ]);
  const token = debug.data?.data;
  if (!debug.ok || !validAppToken(token, appId) || token.type !== 'SYSTEM_USER'
      || !['whatsapp_business_management', 'whatsapp_business_messaging'].every(scope => token.scopes?.includes(scope))
      || !owned.ok || !owned.data.data?.some(account => String(account.id) === VITAL_ACCOUNT)
      || !phone.ok || String(phone.data.id) !== VITAL_PHONE_ID
      || String(phone.data.display_phone_number || '').replace(/\D/g, '') !== VITAL_PHONE
      || phone.data.is_on_biz_app !== true || phone.data.platform_type !== 'CLOUD_API'
      || phone.data.status !== 'CONNECTED') {
    return Response.json({ error: 'The exact Vital account is not authorized and connected' }, { status: 409, headers });
  }
  const db = getSupabaseAdmin();
  const { data: anchors, error: anchorError } = await db.from('workspace_meta_connections')
    .select('id,owner_user_id').eq('workspace_id', 'vital-decor').eq('platform', 'instagram')
    .eq('external_account_id', VITAL_INSTAGRAM_ID).eq('username', 'vitaldecor_').eq('state', 'connected').limit(2);
  if (anchorError || anchors?.length !== 1) {
    return Response.json({ error: 'Existing Vital owner could not be verified' }, { status: 409, headers });
  }
  const ownerId = anchors[0].owner_user_id;
  const { data: state, error: stateError } = await db.from('content_items').select('id')
    .eq('title', '__SOCIAL_HUB_STATE__').eq('user_id', ownerId).limit(1).maybeSingle();
  if (stateError || !state) return Response.json({ error: 'Existing Tide owner unavailable' }, { status: 409, headers });
  const { data: existing, error: existingError } = await db.from('workspace_meta_connections')
    .select('id,owner_user_id,external_account_id,state').eq('workspace_id', 'vital-decor').eq('platform', 'whatsapp');
  if (existingError || existing?.some(row => row.owner_user_id !== ownerId || String(row.external_account_id) !== VITAL_PHONE_ID)) {
    return Response.json({ error: 'Existing workspace account conflicts with Vital' }, { status: 409, headers });
  }
  let pendingId;
  try {
    let saved;
    if (!existing?.some(row => row.state === 'connected')) {
      const { data: pending, error: pendingError } = await db.from('workspace_meta_connection_sessions').insert({
        owner_user_id: ownerId, workspace_id: 'vital-decor', platform: 'whatsapp', status: 'prepared',
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        candidates: [{ id: VITAL_PHONE_ID, name: phone.data.verified_name, displayPhoneNumber: phone.data.display_phone_number,
          wabaId: VITAL_ACCOUNT, accessToken: meta.accessToken }],
      }).select('id').single();
      if (pendingError || !pending) throw new Error('Cannot prepare fixed-account connection');
      pendingId = pending.id;
      saved = await commitConnection(db, ownerId, { platform: 'whatsapp', pendingId, accountId: VITAL_PHONE_ID });
    }
    const status = await readStatus(db, ownerId);
    const subscriptions = await inspect(`${VITAL_ACCOUNT}/subscribed_apps`, meta.accessToken);
    const primary = await getMetaCredentials();
    return Response.json({ ok: true, saved: saved?.ok ?? false, status,
      phone: phone.data,
      subscriptions: subscriptions.ok ? (subscriptions.data.data || []).map(item => ({
        id: item.whatsapp_business_api_data?.id || item.id,
        name: item.whatsapp_business_api_data?.name || item.name,
      })) : subscriptions,
      primaryUnchanged: String(primary?.phoneNumberId) === String(meta.phoneNumberId)
        && String(primary?.wabaId) === String(meta.wabaId) && primary?.source === meta.source,
    }, { headers });
  } catch (error) {
    if (pendingId) await db.from('workspace_meta_connection_sessions').update({ status: 'expired', candidates: [] }).eq('id', pendingId);
    return Response.json({ error: error.status ? error.message : 'Could not complete the fixed Vital connection' },
      { status: error.status || 503, headers });
  }
}

export async function GET(request) {
  const key = request.headers.get('x-vital-probe-key') || '';
  const digest = createHash('sha256').update(key).digest();
  if (Date.now() > PROBE_EXPIRES_AT || !timingSafeEqual(digest, Buffer.from(PROBE_HASH, 'hex'))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  const meta = await getMetaCredentials();
  if (!meta?.accessToken) return Response.json({ credentialAvailable: false });
  const appId = process.env.META_WHATSAPP_APP_ID || process.env.META_APP_ID || '1975149819862842';
  const secret = process.env.META_WHATSAPP_APP_SECRET || process.env.META_APP_SECRET;
  const [debug, phones, owned, systemUser, account] = await Promise.all([
    secret ? inspect('debug_token', `${appId}|${secret}`, { input_token: meta.accessToken })
      : Promise.resolve({ ok: false, message: 'App secret unavailable' }),
    inspect(`${VITAL_ACCOUNT}/phone_numbers`, meta.accessToken, {
      fields: 'id,display_phone_number,verified_name,quality_rating', limit: '100',
    }),
    inspect(`${VITAL_BUSINESS}/owned_whatsapp_business_accounts`, meta.accessToken, {
      fields: 'id,name', limit: '100',
    }),
    inspect('me', meta.accessToken, { fields: 'id,name' }),
    inspect(VITAL_ACCOUNT, meta.accessToken, { fields: 'id,name' }),
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
      type: debug.data.data?.type, userId: debug.data.data?.user_id,
      scopes: debug.data.data?.scopes || [],
      vitalAssetGranted: (debug.data.data?.granular_scopes || []).some((scope) =>
        scope.target_ids?.includes(VITAL_ACCOUNT)),
    } : debug,
    accountAccess: phones.ok ? { ok: true, targetFound: Boolean(phone), phones: (phones.data.data || []).map(item => ({ id: item.id, displayPhoneNumber: item.display_phone_number, verifiedName: item.verified_name })) } : phones,
    systemUser: systemUser.ok ? systemUser.data : systemUser,
    account: account.ok ? account.data : account,
    phone: profile?.ok ? profile.data : profile,
    ownedAccounts: owned.ok ? { ok: true, accounts: owned.data.data || [] } : owned,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

