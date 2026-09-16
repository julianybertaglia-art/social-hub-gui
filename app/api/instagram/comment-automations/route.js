import {
  authorizedOwner,
  automationError,
  ensureSubscription,
  getSubscriptionStatus,
  serverClient,
} from '../audio-automation/service.js';
import { after } from 'next/server';
import { loadOwnerRules, saveOwnerRules } from './service.js';
import { instagramIdentity, recoverLatestMediaComments } from './recovery.js';

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

export async function GET(request) {
  try {
    const db = serverClient();
    const userId = await authorizedOwner(request, db);
    const [{ rules }, identity] = await Promise.all([
      loadOwnerRules(db, userId),
      instagramIdentity(),
    ]);
    const subscription = await getSubscriptionStatus(identity.accountId);

    // Meta can deliver a comment webhook with a delay (or occasionally miss a
    // retry). A status refresh is a safe place to recover the latest matching
    // comments because recovery is idempotent and skips already handled ones.
    after(async () => {
      try {
        const recovery = await recoverLatestMediaComments(db, userId, identity);
        if (recovery.recovered || recovery.matched) {
          console.info('AUTOMACAO:RECOVERY: comentários verificados', recovery);
        }
      } catch (error) {
        console.warn(
          'AUTOMACAO:RECOVERY: não foi possível verificar comentários pendentes',
          error instanceof Error ? error.message : String(error)
        );
      }
    });

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
    if (body?.action === 'recover_latest') {
      const identity = await instagramIdentity();
      return json({ recovery: await recoverLatestMediaComments(db, userId, identity) });
    }
    if (!body || !Array.isArray(body.rules)) throw automationError('Regras inválidas.', 400);

    const identity = await instagramIdentity();
    const saved = await saveOwnerRules(db, userId, body.rules);
    const subscription = await ensureSubscription(identity.accountId);
    return json({ ...saved, account: `@${identity.username}`, ...subscription });
  } catch (error) {
    return failure(error);
  }
}
