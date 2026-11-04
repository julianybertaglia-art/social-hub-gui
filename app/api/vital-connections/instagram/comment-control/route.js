import { authorize, graph } from '../../service';
import { fail, GUI_INSTAGRAM_ID } from '../../helpers.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Comments are authorized separately so a failed comment permission cannot
// disable or replace the existing Instagram Direct connection.
export async function POST(request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    const hostOrigin = request.headers.get('host')
      ? url.protocol + '//' + request.headers.get('host') : url.origin;
    if (!origin || (origin !== url.origin && origin !== hostOrigin)) throw fail('Origem inválida.', 403);
    const payload = await request.json().catch(() => null);
    if (payload?.action !== 'activate_comments') throw fail('Ação não permitida.', 422);

    const { db, ownerId } = await authorize(request);
    const { data: connection, error } = await db.from('workspace_meta_connections')
      .select('workspace_id,platform,external_account_id,page_id,username,access_token,state')
      .eq('owner_user_id', ownerId).eq('workspace_id', 'vital-decor')
      .eq('platform', 'instagram').eq('state', 'connected').maybeSingle();
    if (error) throw fail('Não foi possível consultar a conexão da Vital Decor.', 503);
    if (!connection || !/^\d{5,40}$/.test(String(connection.external_account_id || ''))
      || !/^\d{5,40}$/.test(String(connection.page_id || ''))
      || !connection.access_token || connection.external_account_id === GUI_INSTAGRAM_ID
      || String(connection.username || '').replace(/^@/, '').toLowerCase() !== 'vitaldecor_') {
      throw fail('Conecte o Instagram @vitaldecor_ pela Meta antes de ativar os comentários.', 409);
    }

    try {
      const account = await graph(connection.external_account_id, connection.access_token, {
        query: { fields: 'id,username' },
      });
      if (String(account?.id || '') !== connection.external_account_id
        || String(account?.username || '').toLowerCase() !== 'vitaldecor_') {
        throw fail('A Meta retornou uma conta diferente da Vital Decor.', 409);
      }
      const subscribed = await graph(connection.page_id + '/subscribed_apps', connection.access_token, {
        method: 'POST',
        query: { subscribed_fields: 'messages,messaging_postbacks,comments' },
      });
      if (subscribed?.success !== true) throw new Error('Meta did not confirm comment subscription.');
      const check = await graph(connection.page_id + '/subscribed_apps', connection.access_token, {
        query: { fields: 'id,subscribed_fields' },
      });
      if (!(check?.data || []).some((app) => (app.subscribed_fields || []).includes('comments'))) {
        throw new Error('Meta did not confirm comments field.');
      }
    } catch (metaError) {
      if (metaError?.status === 409) throw metaError;
      throw fail('A Meta não confirmou a permissão para comentários. Autorize novamente @vitaldecor_ na Meta, incluindo o acesso aos comentários, e tente ativar.', 422);
    }
    return Response.json({ ok: true, commentsSubscribed: true }, { headers });
  } catch (error) {
    return Response.json({
      error: error?.status ? error.message : 'Não foi possível ativar os comentários da Vital Decor.',
    }, { status: error?.status || 503, headers });
  }
}
