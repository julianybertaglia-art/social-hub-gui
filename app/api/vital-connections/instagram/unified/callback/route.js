import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../whatsapp/lib';
import { graph } from '../../../service';
import {
  CALLBACK_COOKIE, CALLBACK_URL, META_API_VERSION, UNIFIED_APP_ID,
  VITAL_BUSINESS_ID, VITAL_INSTAGRAM_ID, safeAuthError, selectVitalInstagram,
} from '../lib.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authFailure(reason, metaError = null) {
  // Store only allowlisted error codes, not Graph response text or credentials.
  const rawCode = Number(metaError?.code);
  const rawSubcode = Number(metaError?.error_subcode);
  return Object.assign(new Error(reason), {
    reason,
    metaCode: Number.isInteger(rawCode) && rawCode > 0 && rawCode < 1000000 ? rawCode : null,
    metaSubcode: Number.isInteger(rawSubcode) && rawSubcode > 0 && rawSubcode < 1000000000 ? rawSubcode : null,
  });
}

// Facebook Login for Business can fail with a generic Graph error (#1)
// when the app secret is invalid or the authorization URL's redirect must
// also be provided on exchange. Probe credentials independently first, so
// failures can be diagnosed without recording codes, tokens or error text.
async function resolveAppSecret() {
  const candidates = [
    { value: process.env.META_APP_SECRET, source: 'meta' },
    // A read-only compatibility fallback for the same registered Meta app.
    // It does not modify or reconnect WhatsApp.
    { value: process.env.META_WHATSAPP_APP_SECRET, source: 'legacy' },
  ].filter((candidate, index, all) =>
    typeof candidate.value === 'string' &&
    candidate.value.length > 8 &&
    all.findIndex((other) => other.value === candidate.value) === index);
  if (!candidates.length) throw authFailure('secret_missing');
  let lastMetaError = null;
  for (const candidate of candidates) {
    const url = new URL('https://graph.facebook.com/' + META_API_VERSION + '/oauth/access_token');
    url.searchParams.set('client_id', UNIFIED_APP_ID);
    url.searchParams.set('client_secret', candidate.value);
    url.searchParams.set('grant_type', 'client_credentials');
    try {
      const response = await fetch(url, {
        cache: 'no-store', signal: AbortSignal.timeout(9000),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && typeof payload.access_token === 'string' && payload.access_token.length > 20) {
        return candidate;
      }
      lastMetaError = payload?.error || null;
    } catch { /* Do not expose the secret or full request URL. */ }
  }
  throw authFailure('app_credentials', lastMetaError);
}

async function exchangeCode(code) {
  const credential = await resolveAppSecret();
  const endpoint = 'https://graph.facebook.com/' + META_API_VERSION + '/oauth/access_token';
  let lastMetaError = null;
  // Unified Login docs describe a code-only exchange. Some Facebook Login
  // configurations bind redirect_uri to the code. Retry only after an error,
  // and only with the exact redirect used in the authorization dialogue.
  for (const withRedirect of [false, true]) {
    const url = new URL(endpoint);
    url.searchParams.set('client_id', UNIFIED_APP_ID);
    url.searchParams.set('client_secret', credential.value);
    url.searchParams.set('code', code);
    if (withRedirect) url.searchParams.set('redirect_uri', CALLBACK_URL);
    try {
      const response = await fetch(url, {
        cache: 'no-store', signal: AbortSignal.timeout(10000),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && typeof payload.access_token === 'string' && payload.access_token.length > 20) {
        return { token: payload.access_token, appSecret: credential.value };
      }
      lastMetaError = payload?.error || null;
      // Code reuse and permission errors are definitive, not retryable.
      if (lastMetaError && ![1, 100].includes(Number(lastMetaError.code))) break;
    } catch {
      // A transport error may be transient; retry with the exact redirect once.
    }
  }
  throw authFailure('exchange', lastMetaError);
}

async function verifyUnifiedToken(token, secret) {
  let debug;
  try {
    debug = await graph('debug_token', UNIFIED_APP_ID + '|' + secret, {
      query: { input_token: token },
    });
  } catch { throw authFailure('token_invalid'); }
  if (debug?.data?.is_valid !== true || String(debug.data.app_id) !== UNIFIED_APP_ID) {
    throw authFailure('token_invalid');
  }
  const scopes = debug?.data?.scopes;
  if (Array.isArray(scopes) && scopes.length &&
      !['instagram_basic', 'instagram_manage_messages', 'instagram_manage_comments']
        .every((required) => scopes.includes(required))) {
    throw authFailure('permissions');
  }
  let identity;
  try {
    identity = await graph('me', token, { query: { fields: 'client_business_id' } });
  } catch { throw authFailure('wrong_business'); }
  if (String(identity?.client_business_id || '') !== VITAL_BUSINESS_ID) {
    throw authFailure('wrong_business');
  }
  let accounts;
  try {
    accounts = await graph('me/assigned_instagram_accounts', token, {
      query: { fields: 'id,username', limit: '100' },
    });
  } catch { throw authFailure('account_not_shared'); }
  const account = selectVitalInstagram(accounts);
  if (!account) throw authFailure('account_not_shared');

  // A valid shared asset must also be accessible with this exact token.
  let profile;
  try {
    profile = await graph(VITAL_INSTAGRAM_ID, token, { query: { fields: 'id,username' } });
  } catch { throw authFailure('account_not_shared'); }
  if (String(profile.id || '') !== VITAL_INSTAGRAM_ID ||
      String(profile.username || '').toLowerCase() !== 'vitaldecor_') {
    throw authFailure('account_not_shared');
  }
  return account;
}

async function subscribeInstagram(token) {
  try {
    const result = await graph(VITAL_INSTAGRAM_ID + '/subscribed_apps', token, {
      method: 'POST', query: { subscribed_fields: 'messages,comments' },
    });
    if (result?.success !== true) throw new Error('not_subscribed');
    const checked = await graph(VITAL_INSTAGRAM_ID + '/subscribed_apps', token, {
      query: { fields: 'id,subscribed_fields' },
    });
    const fields = new Set((checked?.data || []).flatMap((app) => app.subscribed_fields || []));
    if (!fields.has('messages') || !fields.has('comments')) throw new Error('missing_fields');
  } catch { throw authFailure('subscribe'); }
}

function redirectForResult(kind, reason = '') {
  const target = new URL('/conexoes/vital-decor/instagram-automacoes', CALLBACK_URL);
  target.searchParams.set('ig_auth', kind);
  if (reason) target.searchParams.set('reason', safeAuthError(reason));
  const response = NextResponse.redirect(target, { status: 303 });
  response.cookies.set(CALLBACK_COOKIE, '', {
    path: '/api/vital-connections/instagram/unified/callback',
    maxAge: 0, httpOnly: true, secure: true, sameSite: 'lax',
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function GET(request) {
  const url = new URL(request.url);
  if (url.origin !== new URL(CALLBACK_URL).origin) return redirectForResult('failed', 'state');
  const state = url.searchParams.get('state') || '';
  const cookie = request.cookies.get(CALLBACK_COOKIE)?.value || '';
  if (!/^[0-9a-f-]{36}$/i.test(state) || state !== cookie) {
    return redirectForResult('failed', 'state');
  }
  const db = getSupabaseAdmin();
  let session;
  try {
    // Read the owner only from the one-time session in the database.
    const { data, error } = await db.from('workspace_meta_connection_sessions')
      .select('id,owner_user_id,expires_at,status,workspace_id,platform')
      .eq('id', state).eq('workspace_id', 'vital-decor')
      .eq('platform', 'instagram').maybeSingle();
    if (error || !data || data.status !== 'prepared' ||
        new Date(data.expires_at).getTime() <= Date.now()) {
      return redirectForResult('failed', 'expired');
    }
    session = data;
    const { data: claimed, error: claimError } = await db.from('workspace_meta_connection_sessions')
      .update({ status: 'consuming' }).eq('id', state)
      .eq('owner_user_id', data.owner_user_id).eq('status', 'prepared')
      .gt('expires_at', new Date().toISOString()).select('id').maybeSingle();
    if (claimError || !claimed) return redirectForResult('failed', 'state');

    if (url.searchParams.has('error')) throw authFailure('cancelled');
    const code = url.searchParams.get('code') || '';
    if (!code || code.length > 4096) throw authFailure('missing_code');
    const { token, appSecret } = await exchangeCode(code);
    await verifyUnifiedToken(token, appSecret);
    await subscribeInstagram(token);

    // Only after the new token, identity and both subscriptions pass do we
    // replace the existing Vital Instagram token. WhatsApp is never touched.
    const now = new Date().toISOString();
    const { data: saved, error: saveError } = await db.from('workspace_meta_connections')
      .upsert({
        owner_user_id: data.owner_user_id,
        workspace_id: 'vital-decor',
        platform: 'instagram',
        external_account_id: VITAL_INSTAGRAM_ID,
        access_token: token,
        page_id: null,
        waba_id: null,
        username: 'vitaldecor_',
        display_name: 'Vital Decor',
        picture_url: null,
        display_phone_number: null,
        state: 'connected',
        connected_at: now,
        updated_at: now,
        automatic_replies_enabled: true,
      }, { onConflict: 'owner_user_id,workspace_id,platform' })
      .select('id').single();
    if (saveError || !saved?.id) throw authFailure('save');

    await db.from('workspace_meta_connection_sessions')
      .update({ status: 'consumed', candidates: [] })
      .eq('id', state).eq('owner_user_id', data.owner_user_id).eq('status', 'consuming');
    return redirectForResult('connected');
  } catch (error) {
    // The user can close the confirmation screen before taking a screenshot.
    // Persist only the allowlisted error code, never tokens, Meta response bodies,
    // authorization codes or private account details.
    const reason = safeAuthError(error?.reason);
    const metaCode = error?.metaCode || null;
    const metaSubcode = error?.metaSubcode || null;
    if (session?.owner_user_id) {
      const { error: diagnosticError } = await db.from('workspace_meta_connection_sessions')
        .update({
          status: 'expired',
          candidates: [{ type: 'unified_oauth_failure', reason, metaCode, metaSubcode }],
        })
        .eq('id', state).eq('owner_user_id', session.owner_user_id)
        .eq('status', 'consuming');
      if (diagnosticError) console.warn('VITAL:IG:OAUTH_DIAGNOSTIC_PERSIST_FAILED');
    }
    console.warn('VITAL:IG:UNIFIED_AUTH_FAILED', reason);
    return redirectForResult('failed', reason);
  }
}
