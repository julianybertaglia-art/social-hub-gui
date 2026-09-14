import { getMetaCredentials, WHATSAPP_API_VERSION } from '../lib';

export const dynamic = 'force-dynamic';

const DEFAULT_WABA_ID = '2367783123681402';
const ENSURE_INTERVAL_MS = 5 * 60 * 1000;
let lastEnsureAt = 0;
let lastEnsureResult = null;

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
  const meta = await getMetaCredentials();
  const hasAccessToken = Boolean(meta?.accessToken);
  const hasPhoneNumberId = Boolean(meta?.phoneNumberId);
  const verifyToken = String(
    process.env.META_WHATSAPP_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN || ''
  ).trim();
  const hasVerifyToken = Boolean(verifyToken);
  const hasAppSecret = Boolean(process.env.META_APP_SECRET);

  const auth = hasAccessToken && hasPhoneNumberId
    ? await validateMetaAuthentication(meta)
    : { valid: false, reason: 'missing_credentials' };

  const connected = Boolean(auth.valid);
  const webhookReady = hasVerifyToken && hasAppSecret;
  const webhookEnsure = connected && hasVerifyToken
    ? await ensureCoexistenceWebhook(meta, origin, verifyToken)
    : { ok: false, skipped: true };

  const needsReauthorization = hasAccessToken && hasPhoneNumberId && !connected;

  return Response.json({
    ok: true,
    provider: 'meta',
    configured: connected,
    connected,
    canSend: connected,
    needsReauthorization,
    webhookReady,
    webhookEnsure,
    state: connected ? 'connected' : needsReauthorization ? 'reauthorization_required' : 'authorization_required',
    error: needsReauthorization
      ? 'A autorização da Meta expirou ou foi invalidada. Reconecte o WhatsApp Business pela Meta para voltar a enviar.'
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
    wabaId: meta?.wabaId || null,
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
      storedMetaConnection: meta?.source === 'meta_embedded_signup',
      officialEnvironmentFallback: meta?.source === 'meta_environment',
    },
    webhookUrl: origin + '/api/whatsapp/webhook',
  }, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
