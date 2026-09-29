import { authorizedOwner, ensureSubscription, serverClient } from '../audio-automation/service.js';
import {
  loadOwnerFlows,
  saveOwnerFlows,
  uploadFlowAudio,
} from './service.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });
}

function failure(error) {
  return json({ error: error?.status ? error.message : 'Não foi possível salvar as automações.' }, error?.status || 500);
}

export async function GET(request) {
  try {
    const db = serverClient();
    const userId = await authorizedOwner(request, db);
    const { flows } = await loadOwnerFlows(db, userId);
    return json({ flows });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request) {
  try {
    const db = serverClient();
    const userId = await authorizedOwner(request, db);
    const body = await request.json().catch(() => null);
    if (!body) return json({ error: 'Dados inválidos.' }, 400);

    if (body.action === 'upload_audio') {
      const uploaded = await uploadFlowAudio(db, userId, body.audioBase64, body.fileName);
      return json(uploaded);
    }

    if (!Array.isArray(body.flows)) return json({ error: 'Lista de automações inválida.' }, 400);
    const saved = await saveOwnerFlows(db, userId, body.flows);

    if (saved.flows.some((flow) => flow.active)) {
      const accountId = '17841401155694295';
      await ensureSubscription(accountId);
    }

    return json(saved);
  } catch (error) {
    return failure(error);
  }
}
