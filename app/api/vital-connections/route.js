import { authorize, prepareInstagram, prepareWhatsApp, commitConnection, readStatus } from './service';
import { fail } from './helpers.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const headers = { 'Cache-Control': 'no-store' };

function errorResponse(error) {
  return Response.json({ error: error.status ? error.message : 'Não foi possível concluir a conexão. Tente novamente.' },
    { status: error.status || 503, headers });
}

export async function GET(request) {
  try {
    const { db, ownerId } = await authorize(request);
    return Response.json(await readStatus(db, ownerId), { headers });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request) {
  try {
    const origin = request.headers.get('origin');
    const requestUrl = new URL(request.url);
    const publicOrigin = request.headers.get('host')
      ? requestUrl.protocol + '//' + request.headers.get('host') : requestUrl.origin;
    if (!origin || (origin !== requestUrl.origin && origin !== publicOrigin)) {
      throw fail('Origem da solicitação inválida.', 403);
    }
    const { db, ownerId } = await authorize(request);
    const body = await request.json();
    let result;
    if (body.action === 'prepare_instagram') result = await prepareInstagram(db, ownerId, body.userToken);
    else if (body.action === 'prepare_whatsapp') result = await prepareWhatsApp(db, ownerId, body);
    else if (body.action === 'commit') result = await commitConnection(db, ownerId, body);
    else throw fail('Ação inválida.');
    return Response.json(result, { headers });
  } catch (error) { return errorResponse(error); }
}
