import { getStoredMetaConnection, WHATSAPP_API_VERSION } from '../lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function graphGet(path, token) {
  const response = await fetch(`https://graph.facebook.com/${WHATSAPP_API_VERSION}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    const error = new Error(payload?.error?.message || `Meta HTTP ${response.status}`);
    error.code = payload?.error?.code || response.status;
    throw error;
  }
  return payload;
}

export async function GET() {
  const stored = await getStoredMetaConnection();
  const token = stored?.access_token || '';
  const phoneNumberId = stored?.phone_number_id || '';
  const wabaId = stored?.waba_id || '';
  const checks = {
    storedConnection: Boolean(stored),
    accessToken: Boolean(token),
    phoneNumberId: Boolean(phoneNumberId),
    verifyToken: Boolean(
      process.env.META_WHATSAPP_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN
    ),
    appSecret: Boolean(process.env.META_APP_SECRET),
    wabaId: Boolean(wabaId),
    legacyBridgeDisabled: true,
  };

  const result = {
    ok: true,
    provider: 'meta',
    configured: checks.accessToken && checks.phoneNumberId && checks.verifyToken && checks.appSecret,
    connected: false,
    checks,
    phone: null,
    subscriptions: null,
    coexistence: {
      ready: false,
      reason: token && phoneNumberId
        ? 'Validando a conexão oficial na Meta.'
        : 'A autorização oficial da Meta ainda não foi concluída.',
    },
    errors: [],
  };

  if (!token || !phoneNumberId) {
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const phone = await graphGet(
      `${phoneNumberId}?fields=display_phone_number,verified_name,is_on_biz_app,platform_type,status,code_verification_status,quality_rating`,
      token
    );

    result.phone = {
      id: phone.id || phoneNumberId,
      displayPhoneNumber: phone.display_phone_number || null,
      verifiedName: phone.verified_name || null,
      isOnBizApp: phone.is_on_biz_app ?? null,
      platformType: phone.platform_type || null,
      status: phone.status || null,
      codeVerificationStatus: phone.code_verification_status || null,
      qualityRating: phone.quality_rating || null,
    };

    const isCoexistence = phone.is_on_biz_app === true && phone.platform_type === 'CLOUD_API';
    const isConnected = ['CONNECTED', 'APPROVED'].includes(String(phone.status || '').toUpperCase());
    result.connected = isConnected;
    result.coexistence = {
      ready: isCoexistence && isConnected,
      isCoexistence,
      isConnected,
      reason: isCoexistence
        ? (isConnected ? 'Coexistência ativa e número conectado.' : 'Coexistência detectada, mas o número ainda não está conectado.')
        : phone.is_on_biz_app === true
          ? 'O número continua no WhatsApp Business, mas ainda não foi provisionado como CLOUD_API.'
          : 'O número não está identificado como WhatsApp Business App + Cloud API.',
    };
  } catch (error) {
    result.ok = false;
    result.errors.push({ scope: 'phone', code: error.code || null, message: error.message });
  }

  if (token && wabaId) {
    try {
      const subscriptions = await graphGet(`${wabaId}/subscribed_apps`, token);
      result.subscriptions = Array.isArray(subscriptions?.data)
        ? subscriptions.data.map((item) => ({
            id: item.id || null,
            name: item.name || null,
            subscribedFields: item.subscribed_fields || [],
          }))
        : [];
    } catch (error) {
      result.ok = false;
      result.errors.push({ scope: 'subscriptions', code: error.code || null, message: error.message });
    }
  }

  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
