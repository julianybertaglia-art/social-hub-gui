import { authorizedOwner, serverClient } from '../audio-automation/service.js';
import { listOwnerContacts } from '../../../argo/novidades/service.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const db = serverClient();
    const userId = await authorizedOwner(request, db);
    return Response.json(await listOwnerContacts(db, userId), { headers });
  } catch (error) {
    return Response.json({ error: error?.status ? error.message : 'Não foi possível carregar os cadastros.' }, {
      status: error?.status || 503,
      headers,
    });
  }
}
