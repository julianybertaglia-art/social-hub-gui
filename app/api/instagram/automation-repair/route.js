import { ensureSubscription, metaRequest } from '../audio-automation/service.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REPAIR_KEY = 'tp-repair-20260929-5f08df7ab3c8';

export async function POST(request) {
  if (request.headers.get('x-tideplace-repair-key') !== REPAIR_KEY) {
    return Response.json({ ok: false }, { status: 403 });
  }

  try {
    const profile = await metaRequest('me?fields=user_id,username');
    const accountId = String(profile?.user_id || profile?.id || '');
    if (String(profile?.username || '').toLowerCase() !== 'gui_nonato' || !/^\d+$/.test(accountId)) {
      return Response.json({ ok: false, error: 'Conta inesperada.' }, { status: 403 });
    }

    const result = await ensureSubscription(accountId);
    return Response.json({
      ok: true,
      account: '@gui_nonato',
      fields: result.fields,
      callbackActive: Boolean(result.appWebhook?.active),
      callbackUrl: result.appWebhook?.callbackUrl || null,
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: String(error?.message || 'Falha na reparação.').slice(0, 300),
      status: error?.status || 500,
    });
  }
}
