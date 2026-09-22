import {
  controlWhatsAppBridge,
  getWhatsAppBridgeStatus,
  isWhatsAppBridgeConfigured,
} from '../lib';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isWhatsAppBridgeConfigured()) {
    return Response.json({
      ok: false,
      configured: false,
      provider: 'meta',
      groupBridge: true,
      state: 'not_configured',
      error: 'A conexão auxiliar de grupos ainda não está configurada.',
    }, { status: 503 });
  }

  try {
    const status = await getWhatsAppBridgeStatus();
    return Response.json({
      ...status,
      configured: true,
      provider: 'meta',
      groupBridge: true,
    });
  } catch (error) {
    return Response.json({
      ok: false,
      configured: true,
      provider: 'meta',
      groupBridge: true,
      state: 'unavailable',
      error: error instanceof Error ? error.message : 'Não foi possível consultar a conexão de grupos.',
    }, { status: 503 });
  }
}

export async function POST(request) {
  if (!isWhatsAppBridgeConfigured()) {
    return Response.json({
      ok: false,
      error: 'A conexão auxiliar de grupos ainda não está configurada.',
    }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || '').trim();

  try {
    const status = await controlWhatsAppBridge(action);
    return Response.json({
      ...status,
      configured: true,
      provider: 'meta',
      groupBridge: true,
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Não foi possível controlar a conexão de grupos.',
    }, { status: 503 });
  }
}
