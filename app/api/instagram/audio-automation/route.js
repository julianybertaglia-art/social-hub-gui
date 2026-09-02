import {
  authorizedOwner,
  automationError,
  buildAudioMenu,
  getOwnerAutomation,
  serverClient,
  setAutomationActive,
} from './service.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });
}

function failure(error) {
  return json(
    { error: error?.status ? error.message : 'Não foi possível concluir. Atualize e tente novamente.' },
    error?.status || 500
  );
}

function clientAutomation(automation) {
  if (!automation) return null;
  const menu = buildAudioMenu(automation).attachment.payload;
  return {
    name: automation.name,
    directKeyword: automation.direct_keyword,
    menuMessage: menu.text,
    menuButtons: menu.buttons,
    active: Boolean(automation.active),
    updatedAt: automation.updated_at,
  };
}

export async function GET(request) {
  try {
    const db = serverClient();
    const userId = await authorizedOwner(request, db);
    return json({ automation: clientAutomation(await getOwnerAutomation(db, userId)) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request) {
  try {
    const db = serverClient();
    const userId = await authorizedOwner(request, db);
    const body = await request.json().catch(() => null);
    if (!body || !['activate', 'pause'].includes(body.action)) {
      throw automationError('Ação inválida.', 400);
    }

    const automation = await setAutomationActive(db, userId, body.action === 'activate');
    return json({ automation: clientAutomation(automation) });
  } catch (error) {
    return failure(error);
  }
}
