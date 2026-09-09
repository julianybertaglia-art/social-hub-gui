import {
  controlWhatsAppBridge,
  getWhatsAppBridgeStatus,
  getWhatsAppProvider,
  isWhatsAppBridgeConfigured,
} from '../lib';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (getWhatsAppProvider() !== 'baileys') {
    return Response.json({
      ok: false,
      provider: getWhatsAppProvider(),
      error: 'A ponte Baileys não está selecionada.',
    }, { status: 409 });
  }

  if (!isWhatsAppBridgeConfigured()) {
    return Response.json({
      ok: false,
      state: 'not_configured',
      error: 'A ponte Baileys ainda não foi configurada.',
    }, { status: 503 });
  }

  try {
    return Response.json(await getWhatsAppBridgeStatus());
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Ponte indisponível.',
    }, { status: 503 });
  }
}

export async function POST(request) {
  if (getWhatsAppProvider() !== 'baileys') {
    return Response.json({
      ok: false,
      error: 'A ponte Baileys não está selecionada.',
    }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || '').toLowerCase();

  try {
    const status = await controlWhatsAppBridge(action);
    return Response.json({ ...status, action });
  } catch (error) {
    const status = [
      'WHATSAPP_BRIDGE_NOT_CONFIGURED',
      'BRIDGE_NOT_CONNECTED',
    ].includes(error?.code) ? 503 : 500;

    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Não foi possível controlar a ponte.',
    }, { status });
  }
}
