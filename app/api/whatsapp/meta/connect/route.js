import { getSupabaseAdmin, WHATSAPP_API_VERSION } from '../../lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const META_APP_ID = process.env.META_APP_ID || '1975149819862842';

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

async function exchangeCode(code) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) throw new Error('META_APP_SECRET não configurado no servidor.');

  const body = new URLSearchParams({
    client_id: META_APP_ID,
    client_secret: appSecret,
    code,
  });

  const payload = await graphJson(
    `https://graph.facebook.com/${WHATSAPP_API_VERSION}/oauth/access_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }
  );

  if (!payload?.access_token) throw new Error('A Meta não devolveu o token de acesso.');
  return payload.access_token;
}

async function getPhoneNumbers(wabaId, accessToken) {
  const fields = 'id,display_phone_number,verified_name,quality_rating';
  const payload = await graphJson(
    `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${encodeURIComponent(wabaId)}/phone_numbers?fields=${encodeURIComponent(fields)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return Array.isArray(payload?.data) ? payload.data : [];
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

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const code = String(body?.code || '').trim();
  const wabaId = String(body?.wabaId || body?.waba_id || '').trim();
  const requestedPhoneId = String(body?.phoneNumberId || body?.phone_number_id || '').trim();

  if (!code || !wabaId) {
    return Response.json({
      ok: false,
      error: 'O Cadastro Incorporado não devolveu código e WABA completos.',
    }, { status: 400 });
  }

  try {
    const accessToken = await exchangeCode(code);
    const phones = await getPhoneNumbers(wabaId, accessToken);

    if (!phones.length) {
      throw new Error('A conexão foi autorizada, mas nenhum número foi encontrado nessa conta do WhatsApp.');
    }

    const phone = requestedPhoneId
      ? phones.find((item) => String(item.id) === requestedPhoneId)
      : phones[0];

    if (!phone) {
      throw new Error('O número escolhido não foi encontrado na conta autorizada.');
    }

    await subscribeApp(wabaId, accessToken);

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('whatsapp_meta_connections')
      .upsert({
        id: 'primary',
        waba_id: wabaId,
        phone_number_id: String(phone.id),
        access_token: accessToken,
        display_phone_number: phone.display_phone_number || null,
        verified_name: phone.verified_name || null,
        coexistence: true,
        connected_at: now,
        updated_at: now,
      }, { onConflict: 'id' });

    if (error) throw error;

    const sync = { contacts: false, history: false };
    try {
      await requestSync(String(phone.id), accessToken, 'smb_app_state_sync');
      sync.contacts = true;
    } catch (syncError) {
      console.warn('WhatsApp contact sync request:', syncError);
    }
    try {
      await requestSync(String(phone.id), accessToken, 'history');
      sync.history = true;
    } catch (syncError) {
      console.warn('WhatsApp history sync request:', syncError);
    }

    return Response.json({
      ok: true,
      connected: true,
      wabaId,
      phoneNumberId: String(phone.id),
      displayPhoneNumber: phone.display_phone_number || null,
      verifiedName: phone.verified_name || null,
      multipleNumbersFound: phones.length > 1,
      sync,
    });
  } catch (error) {
    console.error('WhatsApp Meta Embedded Signup:', error);
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Falha ao concluir a conexão com a Meta.',
    }, { status: 500 });
  }
}
