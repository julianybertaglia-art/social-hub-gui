import { authorizedOwner, serverClient } from '../instagram/audio-automation/service.js';
import { CONSULTORIA_OWNER, CONSULTORIA_CAMPAIGN, REVIEW_STATUS, applicationError } from '../../lib/consultoria.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const fields = 'id,name,phone,instagram,experience,revenue,product,store_url,challenge,recording,segment,marketing_opt_in,review_status,review_notes,created_at,updated_at';
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store, max-age=0' } });
async function owner(request, db) {
  const id = await authorizedOwner(request, db);
  if (id !== CONSULTORIA_OWNER) throw applicationError('Esta conta não tem acesso às candidaturas do Gui.', 403);
}
export async function GET(request) {
  try {
    const db = serverClient(); await owner(request, db);
    const { data, error } = await db.from('consultoria_applications').select(fields)
      .eq('owner_id', CONSULTORIA_OWNER).eq('campaign', CONSULTORIA_CAMPAIGN)
      .order('created_at', { ascending: false }).limit(1001);
    if (error) throw applicationError('Não foi possível carregar as candidaturas.', 503);
    return json({ applications: (data || []).slice(0, 1000), truncated: (data || []).length > 1000 });
  } catch (error) { return json({ error: error?.status ? error.message : 'Não foi possível carregar as candidaturas.' }, error?.status || 503); }
}
export async function PATCH(request) {
  try {
    const db = serverClient(); await owner(request, db);
    const body = await request.json().catch(() => null);
    if (!body || !/^[0-9a-f-]{36}$/i.test(String(body.id || '')) || !Object.hasOwn(REVIEW_STATUS, body.status)
      || typeof body.notes !== 'string' || body.notes.length > 3000 || !Number.isFinite(Date.parse(body.updatedAt))) {
      throw applicationError('Confira os dados da análise.');
    }
    const { data, error } = await db.from('consultoria_applications').update({
      review_status: body.status, review_notes: body.notes.trim(), updated_at: new Date().toISOString(),
    }).eq('owner_id', CONSULTORIA_OWNER).eq('campaign', CONSULTORIA_CAMPAIGN).eq('id', body.id)
      .eq('updated_at', body.updatedAt).select(fields).maybeSingle();
    if (error) throw applicationError('Não foi possível salvar sua análise.', 503);
    if (!data) throw applicationError('A candidatura foi atualizada em outra aba. Atualize a lista antes de salvar.', 409);
    return json({ application: data });
  } catch (error) { return json({ error: error?.status ? error.message : 'Não foi possível salvar sua análise.' }, error?.status || 503); }
}
