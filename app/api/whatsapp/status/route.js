import { getMetaCredentials, getSupabaseAdmin, WHATSAPP_API_VERSION } from '../lib';

export const dynamic = 'force-dynamic';

const DEFAULT_WABA_ID = '2367783123681402';
const APP_ID = process.env.META_APP_ID || '1975149819862842';
const ENSURE_INTERVAL_MS = 5 * 60 * 1000;
let lastEnsureAt = 0;
let lastEnsureResult = null;
let lastRecoveryAt = 0;
let lastRecoveryResult = null;

async function graphJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    const error = new Error(payload?.error?.message || `Meta HTTP ${response.status}`);
    error.code = payload?.error?.code || response.status;
    error.subcode = payload?.error?.error_subcode || null;
    throw error;
  }
  return payload;
}

async function validateMetaAuthentication(meta) {
  if (!meta?.accessToken || !meta?.phoneNumberId) {
    return { valid: false, reason: 'missing_credentials' };
  }

  try {
    const phone = await graphJson(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${encodeURIComponent(meta.phoneNumberId)}?fields=id,display_phone_number,verified_name,quality_rating,status`,
      { headers: { Authorization: `Bearer ${meta.accessToken}` } }
    );
    return { valid: true, phone };
  } catch (error) {
    return {
      valid: false,
      reason: Number(error?.code) === 190 ? 'authentication_expired' : 'authentication_failed',
      code: error?.code || null,
      subcode: error?.subcode || null,
      message: error instanceof Error ? error.message : 'Falha de autenticação na Meta.',
    };
  }
}

async function tryRecoverEnvironmentToken(meta) {
  if (meta?.source !== 'meta_environment' || !meta?.accessToken || !meta?.phoneNumberId) {
    return { recovered: false, skipped: true, reason: 'not_environment_token' };
  }

  const appSecret = String(process.env.META_APP_SECRET || '').trim();
  if (!APP_ID || !appSecret) {
    return { recovered: false, skipped: true, reason: 'missing_app_credentials' };
  }

  const now = Date.now();
  if (lastRecoveryResult && now - lastRecoveryAt < ENSURE_INTERVAL_MS) {
    return lastRecoveryResult;
  }
  lastRecoveryAt = now;

  try {
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: APP_ID,
      client_secret: appSecret,
      fb_exchange_token: meta.accessToken,
    });

    const exchange = await graphJson(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/oauth/access_token?${params.toString()}`
    );

    if (!exchange?.access_token) {
      lastRecoveryResult = { recovered: false, reason: 'exchange_returned_no_token' };
      return lastRecoveryResult;
    }

    const candidate = {
      ...meta,
      source: 'meta_recovered',
      accessToken: String(exchange.access_token),
      wabaId: meta.wabaId || DEFAULT_WABA_ID,
    };
    const auth = await validateMetaAuthentication(candidate);
    if (!auth.valid) {
      lastRecoveryResult = {
        recovered: false,
        reason: auth.reason || 'recovered_token_invalid',
        code: auth.code || null,
        subcode: auth.subcode || null,
      };
      return lastRecoveryResult;
    }

    const supabase = getSupabaseAdmin();
    const timestamp = new Date().toISOString();
    const { error } = await supabase
      .from('whatsapp_meta_connections')
      .upsert({
        id: 'primary',
        waba_id: candidate.wabaId,
        phone_number_id: candidate.phoneNumberId,
        access_token: candidate.accessToken,
        display_phone_number: auth.phone?.display_phone_number || meta.displayPhoneNumber || null,
        verified_name: auth.phone?.verified_name || meta.verifiedName || null,
        coexistence: true,
        connected_at: timestamp,
        updated_at: timestamp,
      }, { onConflict: 'id' });

    if (error) throw error;

    lastRecoveryResult = {
      recovered: true,
      meta: candidate,
      auth,
      expiresIn: exchange.expires_in || null,
    };
    return lastRecoveryResult;
  } catch (error) {
    lastRecoveryResult = {
      recovered: false,
      reason: 'token_exchange_failed',
      code: error?.code || null,
      subcode: error?.subcode || null,
      message: error instanceof Error ? error.message : 'Não foi possível renovar a credencial Meta existente.',
    };
    return lastRecoveryResult;
  }
}

async function ensureCoexistenceWebhook(meta, origin, verifyToken) {
  if (!meta?.accessToken || !meta?.phoneNumberId || !verifyToken) {
    return { ok: false, skipped: true, reason: 'Credenciais de webhook incompletas.' };
  }

  const now = Date.now();
  if (lastEnsureResult && now - lastEnsureAt < ENSURE_INTERVAL_MS) {
    return lastEnsureResult;
  }
  lastEnsureAt = now;

  const wabaId = meta.wabaId || DEFAULT_WABA_ID;
  const callbackUrl = new URL('/api/whatsapp/webhook', origin).toString();

  try {
    await graphJson(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${encodeURIComponent(wabaId)}/subscribed_apps`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${meta.accessToken}` },
      }
    );

    await graphJson(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${encodeURIComponent(meta.phoneNumberId)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${meta.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhook_configuration: {
            override_callback_uri: callbackUrl,
            verify_token: verifyToken,
          },
        }),
      }
    );

    lastEnsureResult = { ok: true, configured: true };
    return lastEnsureResult;
  } catch (error) {
    lastEnsureResult = {
      ok: false,
      configured: false,
      error: error instanceof Error ? error.message : 'Falha ao garantir webhook do número.',
    };
    return lastEnsureResult;
  }
}

export async function GET(request) {
  const origin = new URL(request.url).origin;
  let meta = await getMetaCredentials();
  let hasAccessToken = Boolean(meta?.accessToken);
  let hasPhoneNumberId = Boolean(meta?.phoneNumberId);
  const verifyToken = String(
    process.env.META_WHATSAPP_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN || ''
  ).trim();
  const hasVerifyToken = Boolean(verifyToken);
  const hasAppSecret = Boolean(process.env.META_APP_SECRET);

  let auth = hasAccessToken && hasPhoneNumberId
    ? await validateMetaAuthentication(meta)
    : { valid: false, reason: 'missing_credentials' };

  let recovery = { recovered: false, skipped: true };
  if (!auth.valid && meta?.source === 'meta_environment') {
    recovery = await tryRecoverEnvironmentToken(meta);
    if (recovery?.recovered && recovery?.meta && recovery?.auth?.valid) {
      meta = recovery.meta;
      auth = recovery.auth;
      hasAccessToken = true;
      hasPhoneNumberId = true;
    }
  }

  const connected = Boolean(auth.valid);
  const webhookReady = hasVerifyToken && hasAppSecret;
  const webhookEnsure = connected && hasVerifyToken
    ? await ensureCoexistenceWebhook(meta, origin, verifyToken)
    : { ok: false, skipped: true };

  const needsCredentialRefresh = hasAccessToken && hasPhoneNumberId && !connected;

  return Response.json({
    ok: true,
    provider: 'meta',
    configured: connected,
    connected,
    canSend: connected,
    needsCredentialRefresh,
    webhookReady,
    webhookEnsure,
    recovery: {
      attempted: meta?.source === 'meta_environment' || Boolean(recovery?.recovered),
      recovered: Boolean(recovery?.recovered),
      reason: recovery?.recovered ? null : recovery?.reason || null,
      code: recovery?.code || null,
      subcode: recovery?.subcode || null,
    },
    state: connected ? 'connected' : needsCredentialRefresh ? 'credential_refresh_required' : 'authorization_required',
    error: needsCredentialRefresh
      ? 'A conexão do número continua ativa, mas a credencial de envio da Meta precisa ser renovada.'
      : null,
    authentication: {
      valid: connected,
      reason: auth.reason || null,
      code: auth.code || null,
      subcode: auth.subcode || null,
    },
    connectionSource: connected ? meta?.source || 'meta' : null,
    coexistence: Boolean(meta?.coexistence),
    displayPhoneNumber: auth?.phone?.display_phone_number || meta?.displayPhoneNumber || null,
    verifiedName: auth?.phone?.verified_name || meta?.verifiedName || null,
    wabaId: meta?.wabaId || DEFAULT_WABA_ID,
    phoneNumberId: meta?.phoneNumberId || null,
    checks: {
      accessToken: hasAccessToken,
      phoneNumberId: hasPhoneNumberId,
      authenticationValid: connected,
      verifyToken: hasVerifyToken,
      appSecret: hasAppSecret,
      webhookReady,
      webhookConfigured: Boolean(webhookEnsure?.configured),
      legacyBridgeDisabled: true,
      storedMetaConnection: meta?.source === 'meta_embedded_signup' || meta?.source === 'meta_recovered',
      officialEnvironmentFallback: meta?.source === 'meta_environment',
    },
    webhookUrl: origin + '/api/whatsapp/webhook',
  }, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
