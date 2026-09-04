export const dynamic = 'force-dynamic';

export async function GET(request) {
  const origin = new URL(request.url).origin;
  const hasAccessToken = Boolean(process.env.META_WHATSAPP_ACCESS_TOKEN);
  const hasPhoneNumberId = Boolean(process.env.META_WHATSAPP_PHONE_NUMBER_ID);
  const hasVerifyToken = Boolean(
    process.env.META_WHATSAPP_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN
  );
  const hasAppSecret = Boolean(process.env.META_APP_SECRET);

  return Response.json({
    ok: true,
    configured: hasAccessToken && hasPhoneNumberId && hasVerifyToken && hasAppSecret,
    checks: {
      accessToken: hasAccessToken,
      phoneNumberId: hasPhoneNumberId,
      verifyToken: hasVerifyToken,
      appSecret: hasAppSecret,
    },
    webhookUrl: `${origin}/api/whatsapp/webhook`,
  });
}
