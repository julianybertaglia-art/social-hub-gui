import { authorizedOwner, serverClient } from '../../instagram/audio-automation/service.js';
import { listInfluencerApplications } from '../../../parcerias/vital-influenciadores/service.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REVIEW_STATUSES = new Set(['pending', 'approved', 'declined']);

export async function GET(request) {
  const headers = { 'Cache-Control': 'no-store, max-age=0' };
  try {
    const db = serverClient();
    await authorizedOwner(request, db);
    const applications = await listInfluencerApplications(db);
    return Response.json({ ok: true, applications }, { headers });
  } catch (error) {
    return Response.json({
      error: error?.status ? error.message : 'Não foi possível carregar os influenciadores.',
    }, { status: error?.status || 503, headers });
  }
}

export async function PATCH(request) {
  const headers = { 'Cache-Control': 'no-store, max-age=0' };
  try {
    const db = serverClient();
    await authorizedOwner(request, db);
    const body = await request.json().catch(() => ({}));
    const id = String(body?.id || '').trim();
    const reviewStatus = String(body?.reviewStatus || '').trim();
    const reviewNotes = String(body?.reviewNotes || '').trim().slice(0, 3000);
    if (!id || !REVIEW_STATUSES.has(reviewStatus)) {
      return Response.json({ error: 'Revisão inválida.' }, { status: 400, headers });
    }

    const { data, error } = await db.from('influencer_applications').update({
      review_status: reviewStatus,
      review_notes: reviewNotes || null,
      reviewed_at: reviewStatus === 'pending' ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: 'Inscrição não encontrada.' }, { status: 404, headers });
    return Response.json({ ok: true, application: data }, { headers });
  } catch (error) {
    return Response.json({
      error: error?.status ? error.message : 'Não foi possível salvar a revisão.',
    }, { status: error?.status || 503, headers });
  }
}
