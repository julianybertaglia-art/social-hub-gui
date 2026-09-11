import { authorizedOwner, serverClient } from '../../instagram/audio-automation/service.js';
import { getAiStatus, saveSuggestionFeedback, suggestReply } from './service.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorResponse(error) {
  return Response.json(
    { ok: false, error: error?.status ? error.message : 'Não foi possível usar a IA agora.' },
    { status: error?.status || 503, headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function GET(request) {
  try {
    const db = serverClient();
    const userId = await authorizedOwner(request, db);
    return Response.json({ ok: true, ...(await getAiStatus(db, userId)) }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const db = serverClient();
    const userId = await authorizedOwner(request, db);
    const body = await request.json().catch(() => ({}));
    const contactId = String(body?.contactId || '').trim();
    if (!contactId) {
      return Response.json({ ok: false, error: 'Lead não informado.' }, { status: 400 });
    }

    const suggestion = await suggestReply(db, userId, contactId);
    return Response.json({ ok: true, suggestion }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request) {
  try {
    const db = serverClient();
    const userId = await authorizedOwner(request, db);
    const body = await request.json().catch(() => ({}));
    const feedback = await saveSuggestionFeedback(db, userId, {
      suggestionId: body?.suggestionId,
      used: body?.used,
      finalText: body?.finalText,
    });
    return Response.json({ ok: true, feedback }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
