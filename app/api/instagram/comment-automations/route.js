import {
  authorizedOwner,
  automationError,
  ensureSubscription,
  getSubscriptionStatus,
  metaRequest,
  serverClient,
} from '../audio-automation/service.js';
import { loadOwnerRules, saveOwnerRules } from './service.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });
}

function failure(error) {
  return json(
    { error: error?.status ? error.message : 'Não foi possível sincronizar as automações.' },
    error?.status || 500
  );
}

async function instagramIdentity() {
  const profile = await metaRequest('me?fields=user_id,username');
  const accountId = String(profile.user_id || profile.id || '');
  if (String(profile.username || '').toLowerCase() !== 'gui_nonato' || !/^\d+$/.test(accountId)) {
    throw automationError('A conta conectada precisa ser @gui_nonato.', 403);
  }
  return { accountId, username: profile.username };
}

export async function GET(request) {
  try {
    const db = serverClient();
    const userId = await authorizedOwner(request, db);
    const [{ rules }, identity] = await Promise.all([
      loadOwnerRules(db, userId),
      instagramIdentity(),
    ]);
    const subscription = await getSubscriptionStatus(identity.accountId);
    return json({ rules, account: `@${identity.username}`, ...subscription });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request) {
  try {
    const db = serverClient();
    const userId = await authorizedOwner(request, db);
    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.rules)) throw automationError('Regras inválidas.', 400);

    const identity = await instagramIdentity();
    const saved = await saveOwnerRules(db, userId, body.rules);
    const subscription = await ensureSubscription(identity.accountId);
    return json({ ...saved, account: `@${identity.username}`, ...subscription });
  } catch (error) {
    return failure(error);
  }
}
