import { metaRequest } from '../audio-automation/service.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY = 'tp-public-reply-20260930';

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

function author(value) {
  return String(value?.from?.username || value?.username || '').trim().replace(/^@/, '').toLowerCase();
}

export async function POST(request) {
  if (request.headers.get('x-tideplace-repair-key') !== KEY) {
    return Response.json({ ok: false }, { status: 403 });
  }

  try {
    const profile = await metaRequest('me?fields=user_id,username');
    const accountId = String(profile?.user_id || profile?.id || '');
    const mediaPayload = await metaRequest(accountId + '/media?fields=id,timestamp&limit=10');
    const media = Array.isArray(mediaPayload?.data) ? mediaPayload.data : [];
    const matches = [];

    for (const item of media) {
      const comments = await metaRequest(
        item.id + '/comments?fields=id,text,timestamp,from,username,replies.limit(50){id,text,from,username}&limit=100'
      );
      for (const comment of (comments?.data || [])) {
        if (author(comment) === 'gui_nonato') continue;
        if (!normalize(comment?.text).includes('IMPORTACAO')) continue;
        matches.push({ comment, mediaId: item.id });
      }
    }

    matches.sort((a, b) => Date.parse(b.comment?.timestamp || 0) - Date.parse(a.comment?.timestamp || 0));
    const target = matches[0];
    if (!target) {
      return Response.json({ ok: false, stage: 'find_comment', error: 'Nenhum comentário IMPORTAÇÃO recente encontrado.' });
    }

    return Response.json({
      ok: true,
      stage: 'inspect',
      commentFound: true,
      commentTimestamp: target.comment?.timestamp || null,
      replies: (target.comment?.replies?.data || []).map((reply) => ({
        author: author(reply) || null,
        text: String(reply?.text || '').slice(0, 120),
      })),
    });
  } catch (error) {
    return Response.json({
      ok: false,
      stage: 'scan',
      error: String(error?.message || 'Falha no diagnóstico').slice(0, 300),
    });
  }
}
