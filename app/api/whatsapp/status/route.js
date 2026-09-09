import {
  getWhatsAppBridgeStatus,
  getWhatsAppProvider,
  isWhatsAppBridgeConfigured,
} from '../lib';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const origin = new URL(request.url).origin;
  const provider = getWhatsAppProvider();

  if (provider === 'baileys') {
    const bridgeConfigured = isWhatsAppBridgeConfigured();
    const base = {
      ok: true,
      provider: 'baileys',
      configured: false,
      connected: false,
      state: bridgeConfigured ? 'starting' : 'not_configured',
      qrDataUrl: null,
      checks: {
        bridgeUrl: Boolean(process.env.WHATSAPP_BRIDGE_URL),
        bridgeToken: Boolean(process.env.WHATSAPP_BRIDGE_TOKEN),
        webhookToken: Boolean(
          process.env.WHATSAPP_BRIDGE_WEBHOOK_TOKEN || process.env.WHATSAPP_BRIDGE_TOKEN
        ),
      },
      webhookUrl: origin + '/api/whatsapp/bridge/webhook',
    };

    if (!bridgeConfigured) return Response.json(base);

    try {
      const bridge = await getWhatsAppBridgeStatus();
      return Response.json({
        ...base,
        ...bridge,
        configured: Boolean(bridge.connected),
        connected: Boolean(bridge.connected),
        qrDataUrl: bridge.qrDataUrl || null,
      });
    } catch (error) {
      return Response.json({
        ...base,
        state: 'error',
        error: error instanceof Error ? error.message : 'Ponte indisponível.',
      });
    }
  }

  const hasAccessToken = Boolean(process.env.META_WHATSAPP_ACCESS_TOKEN);
  const hasPhoneNumberId = Boolean(process.env.META_WHATSAPP_PHONE_NUMBER_ID);
  const hasVerifyToken = Boolean(
    process.env.META_WHATSAPP_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN
  );
  const hasAppSecret = Boolean(process.env.META_APP_SECRET);
  const configured = hasAccessToken && hasPhoneNumberId && hasVerifyToken && hasAppSecret;

  return Response.json({
    ok: true,
    provider: 'meta',
    configured,
    connected: configured,
    state: configured ? 'connected' : 'not_configured',
    checks: {
      accessToken: hasAccessToken,
      phoneNumberId: hasPhoneNumberId,
      verifyToken: hasVerifyToken,
      appSecret: hasAppSecret,
    },
    webhookUrl: origin + '/api/whatsapp/webhook',
  });
}
