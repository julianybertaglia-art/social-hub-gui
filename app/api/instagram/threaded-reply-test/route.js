import { metaRequest } from '../audio-automation/service.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY = 'tp-thread-test-20260930';

export async function POST(request) {
  if (request.headers.get('x-tideplace-thread-key') !== KEY) {
    return Response.json({ ok: false }, { status: 403 });
  }

  const commentId = '18108012665236840';

  try {
    const created = await metaRequest(commentId + '/replies', {
      message: 'Te chamei no Direct 👊',
    });
    const replyId = String(created?.id || '');

    const replies = await metaRequest(
      commentId + '/replies?fields=id,text,hidden,from,username,timestamp&limit=50'
    );
    const list = Array.isArray(replies?.data) ? replies.data : [];
    const found = list.find((item) => String(item?.id || '') === replyId) || null;

    return Response.json({
      ok: true,
      replyId,
      found: Boolean(found),
      hidden: found?.hidden ?? null,
      text: found?.text || null,
      username: found?.from?.username || found?.username || null,
      replyCount: list.length,
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: String(error?.message || 'Falha').slice(0, 350),
    }, { status: 500 });
  }
}
