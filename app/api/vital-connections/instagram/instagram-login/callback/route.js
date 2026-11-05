import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../whatsapp/lib';
import {
  VITAL_IG_ID, VITAL_IG_USERNAME, IG_API_VERSION, IG_LOGIN_CALLBACK, IG_LOGIN_COOKIE,
  verifiedVitalInstagramId, directInstagramLoginConfigured, allowedInstagramAuthFailure,
} from '../lib.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authFailure(reason) { return Object.assign(new Error(reason), { reason }); }

async function exchangeInstagramCode(code) {
  const body = new URLSearchParams({
    client_id: process.env.META_VITAL_IG_APP_ID,
    client_secret: process.env.META_VITAL_IG_APP_SECRET,
    grant_type: 'authorization_code',
    redirect_uri: IG_LOGIN_CALLBACK,
    code,
  });
  const initial = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body, cache: 'no-store', signal: AbortSignal.timeout(12000),
  });
  const result = await initial.json().catch(() => ({}));
  if (!initial.ok || typeof result.access_token !== 'string') throw authFailure('exchange');

  // A short-lived token is not sufficient for unattended production Directs.
  const url = new URL('https://graph.instagram.com/access_token');
  url.searchParams.set('grant_type', 'ig_exchange_token');
  url.searchParams.set('client_secret', process.env.META_VITAL_IG_APP_SECRET);
  url.searchParams.set('access_token', result.access_token);
  const exchanged = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
  const longTerm = await exchanged.json().catch(() => ({}));
  if (!exchanged.ok || typeof longTerm.access_token !== 'string' ||
      !Number.isFinite(Number(longTerm.expires_in)) || Number(longTerm.expires_in) < 86400) {
    throw authFailure('exchange');
  }
  return longTerm.access_token;
}

async function instagramGraph(path, token, { method = 'GET', query = {} } = {}) {
  const url = new URL('https://graph.instagram.com/' + IG_API_VERSION + '/' + path);
  Object.entries(query).forEach(([name, value]) => url.searchParams.set(name, String(value)));
  const response = await fetch(url, {
    method, headers: { Authorization: 'Bearer ' + token }, cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) throw authFailure('token_invalid');
  return result;
}

async function authorizeDirectAndComments(token) {
  const profile = await instagramGraph('me', token, { query: { fields: 'user_id,username' } });
  const igId = verifiedVitalInstagramId(profile);
  if (!igId) throw authFailure('wrong_account');
  let response;
  try {
    response = await instagramGraph('me/subscribed_apps', token, {
      method: 'POST', query: { subscribed_fields: 'messages,comments' },
    });
    if (response?.success !== true) throw authFailure('subscribe');
    const check = await instagramGraph('me/subscribed_apps', token, {
      query: { fields: 'id,subscribed_fields' },
    });
    const fields = new Set((check.data || []).flatMap((value) => value.subscribed_fields || []));
    if (!fields.has('messages') || !fields.has('comments')) throw authFailure('subscribe');
  } catch { throw authFailure('subscribe'); }
  return igId;
}

function redirectResult(kind, reason = '') {
  const url = new URL('/conexoes/vital-decor/instagram-automacoes', IG_LOGIN_CALLBACK);
  url.searchParams.set('ig_auth', kind);
  if (reason) url.searchParams.set('reason', allowedInstagramAuthFailure(reason));
  const response = NextResponse.redirect(url, { status: 303 });
  response.cookies.set(IG_LOGIN_COOKIE, '', {
    path: '/api/vital-connections/instagram/instagram-login/callback',
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 0,
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function GET(request) {
  const url = new URL(request.url);
  if (url.origin !== new URL(IG_LOGIN_CALLBACK).origin) return redirectResult('failed','state');
  const state = url.searchParams.get('state') || '';
  if (!/^[0-9a-f-]{36}$/i.test(state) || state !== request.cookies.get(IG_LOGIN_COOKIE)?.value) {
    return redirectResult('failed','state');
  }
  if (!directInstagramLoginConfigured()) return redirectResult('failed','not_configured');

  const db = getSupabaseAdmin();
  let session;
  try {
    const { data } = await db.from('workspace_meta_connection_sessions')
      .select('id,owner_user_id,status,expires_at')
      .eq('id', state).eq('workspace_id','vital-decor').eq('platform','instagram').maybeSingle();
    if (!data || data.status !== 'prepared' || new Date(data.expires_at).getTime() <= Date.now()) {
      return redirectResult('failed','expired');
    }
    session = data;
    const { data: claim, error: claimError } = await db.from('workspace_meta_connection_sessions')
      .update({ status: 'consuming' }).eq('id', state)
      .eq('owner_user_id', session.owner_user_id).eq('status', 'prepared')
      .gt('expires_at', new Date().toISOString()).select('id').maybeSingle();
    if (claimError || !claim) return redirectResult('failed','state');

    if (url.searchParams.has('error')) throw authFailure('cancelled');
    const code = url.searchParams.get('code') || '';
    if (!code || code.length > 4096) throw authFailure('missing_code');
    const token = await exchangeInstagramCode(code);
    const verifiedIgId = await authorizeDirectAndComments(token);

    // Mutate solely the Vital Instagram connection, after all Meta checks pass.
    const now = new Date().toISOString();
    const { data: saved, error: saveError } = await db.from('workspace_meta_connections')
      .upsert({
        owner_user_id: session.owner_user_id, workspace_id: 'vital-decor',
        platform: 'instagram', external_account_id: verifiedIgId,
        access_token: token, auth_provider: 'instagram_login',
        page_id: null, waba_id: null, username: VITAL_IG_USERNAME,
        display_name: 'Vital Decor', picture_url: null, display_phone_number: null,
        state: 'connected', automatic_replies_enabled: true,
        connected_at: now, updated_at: now,
      }, { onConflict: 'owner_user_id,workspace_id,platform' }).select('id').maybeSingle();
    if (saveError || !saved) throw authFailure('save');
    await db.from('workspace_meta_connection_sessions')
      .update({ status: 'consumed', candidates: [] })
      .eq('id',state).eq('owner_user_id', session.owner_user_id);
    return redirectResult('connected');
  } catch(error) {
    const reason = allowedInstagramAuthFailure(error?.reason);
    if(session?.owner_user_id) {
      await db.from('workspace_meta_connection_sessions')
        .update({ status: 'expired', candidates: [{ type: 'instagram_oauth_failure', reason }] })
        .eq('id',state).eq('owner_user_id',session.owner_user_id).eq('status','consuming');
    }
    console.warn('VITAL:IG:DIRECT_LOGIN_FAILED', reason);
    return redirectResult('failed',reason);
  }
}
