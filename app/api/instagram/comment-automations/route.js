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
    `${identity.accountId}/media?fields=id,caption,timestamp,permalink&limit=10`
  );
  const media = (mediaPayload.data || []).find((item) => (
    activeRules.some((rule) => String(item.caption || '').toUpperCase().includes(rule.keyword))
  ));
  if (!media?.id) throw automationError('Não encontrei um conteúdo recente com uma palavra-chave ativa.', 404);

  const commentsPayload = await metaRequest(
    `${media.id}/comments?fields=id,text,timestamp,from,username&limit=100`
  );
  const matched = (commentsPayload.data || [])
    .map((comment) => ({ comment, rule: findMatchingCommentRule(comment.text, activeRules) }))
    .filter(({ comment, rule }) => rule && authorUsername(comment) !== 'gui_nonato')
    .slice(0, 20);

  const results = [];
  for (const { comment, rule } of matched) {
    const repliesPayload = await metaRequest(
      `${comment.id}/replies?fields=id,text,from,username&limit=100`
    ).catch(() => ({ data: [] }));
    const alreadyPublic = (repliesPayload.data || []).some((reply) => (
      authorUsername(reply) === 'gui_nonato'
      || String(reply.text || '').trim() === rule.publicReply
    ));
    if (alreadyPublic) {
      results.push({ commentId: comment.id, status: 'already_handled' });
      continue;
    }

    let privateSent = false;
    try {
      await metaRequest(`${identity.accountId}/messages`, {
        recipient: { comment_id: comment.id },
        message: { text: rule.privateMessage },
      });
      privateSent = true;
    } catch (error) {
      if (!alreadyPrivateReply(error)) throw error;
    }

    if (rule.publicReply) {
      await metaRequest(`${comment.id}/replies`, { message: rule.publicReply });
    }
    results.push({ commentId: comment.id, status: privateSent ? 'recovered' : 'private_already_sent' });
  }

  return {
    mediaId: String(media.id),
    permalink: String(media.permalink || ''),
    matched: matched.length,
    recovered: results.filter((item) => item.status === 'recovered').length,
    alreadyHandled: results.filter((item) => item.status !== 'recovered').length,
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
