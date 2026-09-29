import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_VERSION = 'v26.0';

async function metaGet(path, token) {
  const response = await fetch('https://graph.instagram.com/' + API_VERSION + '/' + path, {
    headers: { Authorization: 'Bearer ' + token },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    return {
      ok: false,
      status: response.status,
      code: payload?.error?.code || null,
      message: String(payload?.error?.message || 'Erro da Meta').slice(0, 180),
    };
  }
  return { ok: true, status: response.status, payload };
}

export async function GET() {
  const token = String(process.env.META_INSTAGRAM_ACCESS_TOKEN || '').trim();
  const appSecret = String(process.env.META_APP_SECRET || '').trim();
  const webhookToken = String(process.env.META_WEBHOOK_VERIFY_TOKEN || '').trim();
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const supabaseKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();

  const checks = {
    environment: process.env.VERCEL_ENV || 'unknown',
    branch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
    credentials: {
      instagramToken: Boolean(token),
      appSecret: Boolean(appSecret),
      webhookVerifyToken: Boolean(webhookToken),
      supabase: Boolean(supabaseUrl && supabaseKey),
    },
    instagram: { ok: false },
    subscriptions: { ok: false, fields: [], appId: null, appName: null },
    appCredentials: { ok: false, status: null, code: null, message: null },
    appWebhook: { ok: false, object: null, callbackUrl: null, active: null, fields: [] },
    database: { ok: false, stateTable: false, responseLedger: false },
  };

  if (token) {
    const profile = await metaGet('me?fields=user_id,username', token);
    checks.instagram = profile.ok
      ? {
          ok: true,
          username: profile.payload?.username || null,
          accountId: String(profile.payload?.user_id || profile.payload?.id || ''),
        }
      : { ok: false, status: profile.status, code: profile.code, message: profile.message };

    const accountId = checks.instagram?.accountId;
    if (accountId) {
      const subscriptions = await metaGet(accountId + '/subscribed_apps', token);
      if (subscriptions.ok) {
        const apps = Array.isArray(subscriptions.payload?.data) ? subscriptions.payload.data : [];
        const fields = [...new Set(
          apps.flatMap((app) => Array.isArray(app?.subscribed_fields) ? app.subscribed_fields : [])
        )].sort();
        checks.subscriptions = {
          ok: ['comments', 'messages', 'messaging_postbacks'].every((field) => fields.includes(field)),
          fields,
          appId: String(apps[0]?.id || '') || null,
          appName: apps[0]?.name || null,
        };

        const appId = String(apps[0]?.id || '').trim();
        if (appId && appSecret) {
          const oauthUrl = new URL('https://graph.facebook.com/oauth/access_token');
          oauthUrl.searchParams.set('client_id', appId);
          oauthUrl.searchParams.set('client_secret', appSecret);
          oauthUrl.searchParams.set('grant_type', 'client_credentials');

          const oauthResponse = await fetch(oauthUrl, {
            cache: 'no-store',
            signal: AbortSignal.timeout(10000),
          });
          const oauthPayload = await oauthResponse.json().catch(() => ({}));
          const appAccessToken = String(oauthPayload?.access_token || '').trim();

          checks.appCredentials = appAccessToken
            ? { ok: true, status: oauthResponse.status, code: null, message: null }
            : {
                ok: false,
                status: oauthResponse.status,
                code: oauthPayload?.error?.code || null,
                message: String(oauthPayload?.error?.message || 'Credencial do App inválida').slice(0, 180),
              };

          if (appAccessToken) {
            const response = await fetch('https://graph.facebook.com/' + API_VERSION + '/' + appId + '/subscriptions', {
              headers: { Authorization: 'Bearer ' + appAccessToken },
              cache: 'no-store',
              signal: AbortSignal.timeout(10000),
            });
            const payload = await response.json().catch(() => ({}));
            if (response.ok && !payload?.error) {
              const rows = Array.isArray(payload?.data) ? payload.data : [];
              const instagramRow = rows.find((row) => String(row?.object || '').toLowerCase() === 'instagram') || rows[0] || null;
              checks.appWebhook = instagramRow ? {
                ok: Boolean(instagramRow?.active),
                object: instagramRow?.object || null,
                callbackUrl: instagramRow?.callback_url || null,
                active: Boolean(instagramRow?.active),
                fields: (instagramRow?.fields || []).map((field) => typeof field === 'string' ? field : field?.name).filter(Boolean),
              } : { ok: false, object: null, callbackUrl: null, active: null, fields: [] };
            }
          }
        }
      } else {
        checks.subscriptions = {
          ok: false,
          fields: [],
          status: subscriptions.status,
          code: subscriptions.code,
          message: subscriptions.message,
        };
      }
    }
  }

  if (supabaseUrl && supabaseKey) {
    const db = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [stateCheck, ledgerCheck] = await Promise.all([
      db.from('content_items').select('id').eq('title', '__SOCIAL_HUB_STATE__').limit(1),
      db.from('instagram_flow_responses').select('id').limit(1),
    ]);

    checks.database = {
      ok: !stateCheck.error && !ledgerCheck.error,
      stateTable: !stateCheck.error,
      responseLedger: !ledgerCheck.error,
    };
  }

  const ready =
    checks.credentials.instagramToken &&
    checks.credentials.appSecret &&
    checks.credentials.webhookVerifyToken &&
    checks.credentials.supabase &&
    checks.instagram.ok &&
    String(checks.instagram.username || '').toLowerCase() === 'gui_nonato' &&
    checks.subscriptions.ok &&
    checks.appCredentials.ok &&
    checks.appWebhook.ok &&
    checks.database.ok;

  return Response.json({
    ready,
    checks,
    testedAt: new Date().toISOString(),
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
