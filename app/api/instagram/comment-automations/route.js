import {
  authorizedOwner,
  automationError,
  ensureSubscription,
  getSubscriptionStatus,
  metaRequest,
  serverClient,
} from '../audio-automation/service.js';
import { after } from 'next/server';
import { loadOwnerRules, saveOwnerRules } from './service.js';
import { findMatchingCommentRule } from './service.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RECOVERY_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

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

function authorUsername(value) {
  return String(value?.from?.username || value?.username || '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
}

function alreadyPrivateReply(error) {
  return /already|previously|one private reply|já (foi )?respond|replied to this comment/i
    .test(String(error?.message || ''));
}

async function recoverLatestMediaComments(db, userId, identity) {
  const { rules } = await loadOwnerRules(db, userId);
  const activeRules = rules.filter((rule) => rule.active);
  if (!activeRules.length) throw automationError('Nenhuma regra por comentário está ativa.', 422);

  const mediaPayload = await metaRequest(
    `${identity.accountId}/media?fields=id,caption,timestamp,permalink&limit=25`
  );
  const media = (mediaPayload.data || []).filter((item) => item?.id);
  if (!media.length) throw automationError('Não encontrei conteúdo recente para verificar.', 404);

  // A palavra-chave pode ser falada no vídeo sem aparecer na legenda. Por isso,
  // verificamos os comentários dos conteúdos recentes, em vez de adivinhar o
  // Reel pela caption.
  const commentBatches = await Promise.allSettled(media.map(async (item) => {
    const payload = await metaRequest(
      `${item.id}/comments?fields=id,text,timestamp,from,username&limit=100`
    );
    return (payload.data || []).map((comment) => ({ comment, media: item }));
  }));
  const cutoff = Date.now() - RECOVERY_LOOKBACK_MS;
  const matched = commentBatches
    .filter((batch) => batch.status === 'fulfilled')
    .flatMap((batch) => batch.value)
    .filter(({ comment }) => {
      const timestamp = Date.parse(comment.timestamp || '');
      return !Number.isFinite(timestamp) || timestamp >= cutoff;
    })
    .map(({ comment, media: item }) => ({
      comment,
      media: item,
      rule: findMatchingCommentRule(comment.text, activeRules),
    }))
    .filter(({ comment, rule }) => rule && authorUsername(comment) !== 'gui_nonato')
    .sort((left, right) => Date.parse(right.comment.timestamp || 0) - Date.parse(left.comment.timestamp || 0))
    .slice(0, 50);

  const results = [];
  for (const { comment, rule, media: item } of matched) {
    const repliesPayload = await metaRequest(
      `${comment.id}/replies?fields=id,text,from,username&limit=100`
    ).catch(() => ({ data: [] }));
    const alreadyPublic = (repliesPayload.data || []).some((reply) => (
      authorUsername(reply) === 'gui_nonato'
      || String(reply.text || '').trim() === rule.publicReply
    ));
    let privateSent = false;
    try {
      await metaRequest(`${identity.accountId}/messages`, {
        recipient: { comment_id: comment.id },
        message: { text: rule.privateMessage },
      });
      privateSent = true;
    } catch (error) {
      if (!alreadyPrivateReply(error)) {
        results.push({ commentId: comment.id, mediaId: item.id, status: 'failed' });
        continue;
      }
    }

    if (rule.publicReply && !alreadyPublic) {
      await metaRequest(`${comment.id}/replies`, { message: rule.publicReply });
    }
    results.push({
      commentId: comment.id,
      mediaId: item.id,
      status: privateSent ? 'recovered' : 'private_already_sent',
    });
  }

  return {
    mediaScanned: media.length,
    matched: matched.length,
    recovered: results.filter((item) => item.status === 'recovered').length,
    alreadyHandled: results.filter((item) => item.status === 'private_already_sent').length,
    failed: results.filter((item) => item.status === 'failed').length,
  };
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
