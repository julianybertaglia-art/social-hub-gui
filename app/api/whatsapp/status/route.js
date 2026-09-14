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
    throw new Error(payload?.error?.message || `Meta HTTP ${response.status}`);
  }
  return payload;
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

  const connected = hasAccessToken && hasPhoneNumberId;
  const webhookReady = hasVerifyToken && hasAppSecret;
  const webhookEnsure = connected && hasVerifyToken
    ? await ensureCoexistenceWebhook(meta, origin, verifyToken)
    : { ok: false, skipped: true };

  return Response.json({
    ok: true,
    provider: 'meta',
    configured: connected,
    connected,
    canSend: connected,
    webhookReady,
    webhookEnsure,
    state: connected ? 'connected' : 'authorization_required',
    connectionSource: connected ? meta?.source || 'meta' : null,
    coexistence: Boolean(meta?.coexistence),
    displayPhoneNumber: meta?.displayPhoneNumber || null,
    verifiedName: meta?.verifiedName || null,
    wabaId: meta?.wabaId || null,
    phoneNumberId: meta?.phoneNumberId || null,
    checks: {
      accessToken: hasAccessToken,
      phoneNumberId: hasPhoneNumberId,
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
