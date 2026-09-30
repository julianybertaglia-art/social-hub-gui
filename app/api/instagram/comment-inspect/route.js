import { metaRequest } from '../audio-automation/service.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY = 'tp-inspect-comment-20260930';

export async function POST(request) {
  if (request.headers.get('x-tideplace-inspect-key') !== KEY) {
    return Response.json({ ok: false }, { status: 403 });
  }

  try {
    const commentId = '18495632758096010';
    const payload = await metaRequest(
      commentId + '?fields=id,text,from,username,replies.limit(50){id,text,from,username,timestamp}'
    );
    return Response.json({
      ok: true,
      id: payload?.id || null,
      text: payload?.text || null,
      replies: Array.isArray(payload?.replies?.data)
        ? payload.replies.data.map((reply) => ({
            id: reply?.id || null,
            text: reply?.text || null,
            username: reply?.from?.username || reply?.username || null,
            timestamp: reply?.timestamp || null,
          }))
        : [],
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: String(error?.message || 'Falha').slice(0, 300),
    });
  }
}
