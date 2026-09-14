import { getStoredMetaConnection } from '../lib';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const origin = new URL(request.url).origin;
  const storedMeta = await getStoredMetaConnection();
  const hasAccessToken = Boolean(storedMeta?.access_token);
  const hasPhoneNumberId = Boolean(storedMeta?.phone_number_id);
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
    connectionSource: connected ? 'meta_embedded_signup' : null,
    coexistence: Boolean(storedMeta?.coexistence),
    displayPhoneNumber: storedMeta?.display_phone_number || null,
    verifiedName: storedMeta?.verified_name || null,
    wabaId: storedMeta?.waba_id || null,
    phoneNumberId: storedMeta?.phone_number_id || null,
    checks: {
      accessToken: hasAccessToken,
      phoneNumberId: hasPhoneNumberId,
      verifyToken: hasVerifyToken,
      appSecret: hasAppSecret,
      legacyBridgeDisabled: true,
      legacyEnvironmentCredentialsIgnored: Boolean(
        process.env.META_WHATSAPP_ACCESS_TOKEN || process.env.META_WHATSAPP_PHONE_NUMBER_ID
      ),
    },
    webhookUrl: origin + '/api/whatsapp/webhook',
  }, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
