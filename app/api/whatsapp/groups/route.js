import {
  getWhatsAppBridgeGroups,
  getWhatsAppProvider,
} from '../lib';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (getWhatsAppProvider() !== 'baileys') {
    return Response.json({
      ok: false,
      error: 'A consulta de grupos está disponível quando a ponte Baileys está ativa.',
    }, { status: 409 });
  }

  try {
    const result = await getWhatsAppBridgeGroups();
    return Response.json(result);
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Não foi possível carregar os grupos.',
    }, { status: 503 });
  }
}
