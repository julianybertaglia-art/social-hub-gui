import { getMetaCredentials, WHATSAPP_API_VERSION } from '../../lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_WABA_ID = '2367783123681402';

async function graphJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    const message = payload?.error?.message || `Meta HTTP ${response.status}`;
    const error = new Error(message);
    error.code = payload?.error?.code || response.status;
    throw error;
  }
  return payload;
}

async function subscribeApp(wabaId, accessToken) {
  return graphJson(
    `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${encodeURIComponent(wabaId)}/subscribed_apps`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
}

async function requestSync(phoneNumberId, accessToken, syncType) {
  return graphJson(
    `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${encodeURIComponent(phoneNumberId)}/smb_app_data`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: syncType }),
    }
  );
}

export async function POST() {
  const meta = await getMetaCredentials();
  const accessToken = meta?.accessToken || '';
  const phoneNumberId = meta?.phoneNumberId || '';
  const wabaId = meta?.wabaId || DEFAULT_WABA_ID;

  if (!accessToken || !phoneNumberId) {
    return Response.json({ ok: false, error: 'Credenciais oficiais do WhatsApp não configuradas.' }, { status: 503 });
  }

  const result = {
    ok: true,
    credentialSource: meta?.source || null,
    subscribed: false,
    contactsRequested: false,
    historyRequested: false,
    warnings: [],
  };

  try {
    await subscribeApp(wabaId, accessToken);
    result.subscribed = true;
  } catch (error) {
    result.warnings.push(`Webhook: ${error instanceof Error ? error.message : 'falha ao assinar a conta'}`);
  }

  try {
    await requestSync(phoneNumberId, accessToken, 'smb_app_state_sync');
    result.contactsRequested = true;
  } catch (error) {
    result.warnings.push(`Contatos: ${error instanceof Error ? error.message : 'falha ao solicitar sincronização'}`);
  }

  try {
    await requestSync(phoneNumberId, accessToken, 'history');
    result.historyRequested = true;
  } catch (error) {
    result.warnings.push(`Histórico: ${error instanceof Error ? error.message : 'falha ao solicitar sincronização'}`);
  }

  if (!result.subscribed && !result.contactsRequested && !result.historyRequested) {
    return Response.json({ ...result, ok: false }, { status: 502 });
  }

  return Response.json(result);
}
