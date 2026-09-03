import { TABLE, authorizedOwner, latestTest, prepareTest, saveAudioDraft, serverClient, testError } from './service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });
}

function failure(error) {
  return json({ error: error.status ? error.message : 'Não foi possível concluir. Atualize e tente novamente.' }, error.status || 500);
}

export async function GET(request) {
  try {
    const db = serverClient();
    const userId = await authorizedOwner(request, db);
    return json({ test: await latestTest(db, userId) });
  } catch (error) { return failure(error); }
}

export async function POST(request) {
  try {
    const db = serverClient();
    const userId = await authorizedOwner(request, db);
    const body = await request.json().catch(() => null);
    if (!body || !body.action) throw testError('Ação inválida.', 400);

    if (body.action === 'save') {
      return json({ test: await saveAudioDraft(db, userId, body) });
    }

    if (!/^[0-9a-f-]{36}$/i.test(String(body.id || ''))) throw testError('Teste inválido.', 400);
    if (body.action === 'prepare') {
      await prepareTest(db, userId, body.id);
    } else if (body.action === 'result' && ['voice_bubble', 'file', 'not_received'].includes(body.result)) {
      const { data, error } = await db.from(TABLE).update({ visual_result: body.result, updated_at: new Date().toISOString() })
        .eq('id', body.id).eq('user_id', userId).in('status', ['sent', 'send_failed', 'sending'])
        .select('id').maybeSingle();
      if (error) throw testError('Não foi possível salvar o resultado.', 503);
      if (!data) throw testError('O teste ainda não registrou um envio.', 409);
    } else if (body.action === 'cancel') {
      const { data, error } = await db.from(TABLE).update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', body.id).eq('user_id', userId).in('status', ['draft', 'ready', 'prepare_failed'])
        .select('id').maybeSingle();
      if (error) throw testError('Não foi possível encerrar o teste.', 503);
      if (!data) throw testError('O teste já foi enviado ou está em processamento.', 409);
    } else { throw testError('Ação inválida.', 400); }
    return json({ test: await latestTest(db, userId) });
  } catch (error) { return failure(error); }
}
