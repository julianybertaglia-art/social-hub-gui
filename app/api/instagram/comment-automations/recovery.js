import { automationError, metaRequest } from '../audio-automation/service.js';
import { findMatchingCommentRule, loadOwnerRules } from './service.js';

const RECOVERY_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export async function instagramIdentity() {
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

export async function recoverLatestMediaComments(db, userId, identity) {
  const { rules } = await loadOwnerRules(db, userId);
  const activeRules = rules.filter((rule) => rule.active);
  if (!activeRules.length) throw automationError('Nenhuma regra por comentário está ativa.', 422);

  const mediaPayload = await metaRequest(
    `${identity.accountId}/media?fields=id,caption,timestamp,permalink&limit=25`
  );
  const media = (mediaPayload.data || []).filter((item) => item?.id);
  if (!media.length) throw automationError('Não encontrei conteúdo recente para verificar.', 404);

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
    .slice(0, 10);

  const results = await Promise.all(matched.map(async ({ comment, rule, media: item }) => {
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
        return {
          commentId: comment.id,
          mediaId: item.id,
          status: 'failed',
          error: String(error?.message || 'Recusa sem detalhe.'),
        };
      }
    }

    if (rule.publicReply && !alreadyPublic) {
      await metaRequest(`${comment.id}/replies`, { message: rule.publicReply });
    }
    return {
      commentId: comment.id,
      mediaId: item.id,
      status: privateSent ? 'recovered' : 'private_already_sent',
    };
  }));

  return {
    mediaScanned: media.length,
    matched: matched.length,
    recovered: results.filter((item) => item.status === 'recovered').length,
    alreadyHandled: results.filter((item) => item.status === 'private_already_sent').length,
    failed: results.filter((item) => item.status === 'failed').length,
    errors: [...new Set(results.filter((item) => item.status === 'failed').map((item) => item.error))].slice(0, 3),
  };
}
