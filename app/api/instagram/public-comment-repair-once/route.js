import { metaRequest, serverClient } from '../audio-automation/service.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY = 'tp-public-comment-repair-20260930';

export async function POST(request) {
  if (request.headers.get('x-tideplace-repair-key') !== KEY) {
    return Response.json({ ok: false }, { status: 403 });
  }

  const db = serverClient();
  const { data: event, error } = await db
    .from('instagram_automation_events')
    .select('id,media_id,username,public_delivery_mode')
    .not('media_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !event?.media_id) {
    return Response.json({ ok: false, stage: 'event', error: error?.message || 'Evento não encontrado.' }, { status: 500 });
  }

  if (event.public_delivery_mode === 'top_level_mention') {
    return Response.json({ ok: true, stage: 'already_repaired', eventId: event.id });
  }

  const username = String(event.username || '').replace(/^@/, '');
  const message = (username ? '@' + username + ' ' : '') + 'Te chamei no Direct 👊';

  try {
    const created = await metaRequest(String(event.media_id) + '/comments', { message });
    const replyId = String(created?.id || '');

    await db.from('instagram_automation_events')
      .update({
        public_status: 'sent',
        public_reply_id: replyId || null,
        public_delivery_mode: 'top_level_mention',
        public_error: null,
      })
      .eq('id', event.id);

    return Response.json({
      ok: true,
      stage: 'posted',
      eventId: event.id,
      replyId: replyId || null,
    });
  } catch (err) {
    await db.from('instagram_automation_events')
      .update({
        public_status: 'failed',
        public_delivery_mode: 'top_level_mention',
        public_error: String(err?.message || '').slice(0, 300),
      })
      .eq('id', event.id);

    return Response.json({
      ok: false,
      stage: 'post',
      eventId: event.id,
      error: String(err?.message || 'Falha').slice(0, 300),
    }, { status: 500 });
  }
}
