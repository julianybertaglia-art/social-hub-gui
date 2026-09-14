import { getMetaCredentials } from '../lib';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const origin = new URL(request.url).origin;
  const meta = await getMetaCredentials();
  const hasAccessToken = Boolean(meta?.accessToken);
  const hasPhoneNumberId = Boolean(meta?.phoneNumberId);
  const hasVerifyToken = Boolean(
    process.env.META_WHATSAPP_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN
  );
  const hasAppSecret = Boolean(process.env.META_APP_SECRET);
  const connected = hasAccessToken && hasPhoneNumberId && hasVerifyToken && hasAppSecret;

  return Response.json({
    ok: true,
    provider: 'meta',
    configured: connected,
    connected,
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
      legacyBridgeDisabled: true,
      storedMetaConnection: meta?.source === 'meta_embedded_signup',
      officialEnvironmentFallback: meta?.source === 'meta_environment',
    },
    webhookUrl: origin + '/api/whatsapp/webhook',
  }, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
