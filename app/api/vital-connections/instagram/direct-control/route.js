import { authorize, graph } from '../../service';
import { fail, GUI_INSTAGRAM_ID } from '../../helpers.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function verifiedInstagramAccount(connection) {
  if (!connection || connection.workspace_id !== 'vital-decor'
    || connection.platform !== 'instagram' || connection.state !== 'connected'
    || !/^[0-9]{5,40}$/.test(String(connection.external_account_id || ''))
    || !/^[0-9]{5,40}$/.test(String(connection.page_id || ''))
    || !connection.access_token || String(connection.external_account_id) === GUI_INSTAGRAM_ID
    || String(connection.username || '').replace(/^@/, '').toLowerCase() !== 'vitaldecor_') {
    throw fail('Não há uma conexão válida da conta @vitaldecor_. Reautorize o Instagram pela Meta.', 409);
  }
}

export async function POST(request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    const hostOrigin = request.headers.get('host') ? url.protocol + '//' + request.headers.get('host') : url.origin;
    if (!origin || (origin !== url.origin && origin !== hostOrigin)) throw fail('Origem inválida.', 403);

    const payload = await request.json();
    if (!['pause', 'activate_existing'].includes(payload?.action)) throw fail('Ação não permitida.', 422);
    const { db, ownerId } = await authorize(request);
    const table = 'workspace_meta_connections';

    if (payload.action === 'activate_existing') {
      // Try to use the owner's already stored Page token; never send it to the browser.
      const { data: existing, error: lookupError } = await db.from(table)
        .select('id,owner_user_id,workspace_id,platform,external_account_id,page_id,username,access_token,state')
        .eq('owner_user_id', ownerId).eq('workspace_id', 'vital-decor')
        .eq('platform', 'instagram').eq('state', 'connected').maybeSingle();
      if (lookupError) throw fail('Não foi possível consultar a conexão existente.', 503);
      verifiedInstagramAccount(existing);

      try {
        const profile = await graph(existing.external_account_id, existing.access_token, {
          query: { fields: 'id,username' },
        });
        if (String(profile?.id) !== String(existing.external_account_id)
          || String(profile?.username || '').toLowerCase() !== 'vitaldecor_') {
          throw fail('A Meta retornou uma conta diferente da Vital Decor.', 409);
        }

        // Meta must explicitly confirm the message webhook subscription.
        const subscription = await graph(existing.page_id + '/subscribed_apps', existing.access_token, {
          method: 'POST',
          query: { subscribed_fields: 'messages,messaging_postbacks' },
        });
        if (subscription?.success !== true) {
          throw fail('A Meta não confirmou a assinatura das mensagens.', 502);
        }
      } catch (metaError) {
        if (metaError?.status === 409) throw metaError;
        throw fail('A Meta não aceitou a autorização anterior para enviar Directs. Use "Autorizar novamente pela Meta" e conceda acesso às mensagens. Nenhuma resposta foi ativada.', 422);
      }

      const { data: updated, error: updateError } = await db.from(table)
        .update({ automatic_replies_enabled: true, updated_at: new Date().toISOString() })
        .eq('id', existing.id).eq('owner_user_id', ownerId)
        .eq('workspace_id', 'vital-decor').eq('platform', 'instagram')
        .eq('external_account_id', existing.external_account_id).eq('state', 'connected')
        .select('id').maybeSingle();
      if (updateError || !updated) throw fail('A Meta autorizou, mas o TidePlace não conseguiu ativar a resposta. Tente novamente.', 503);
      return Response.json({ ok: true, automaticReplies: true, source: 'existing_meta_connection' }, { headers });
    }

    const { data, error } = await db.from(table)
      .update({ automatic_replies_enabled: false, updated_at: new Date().toISOString() })
      .eq('owner_user_id', ownerId).eq('workspace_id', 'vital-decor')
      .eq('platform', 'instagram').eq('state', 'connected')
      .select('id').maybeSingle();
    if (error || !data) throw fail('A conexão da Vital Decor não foi encontrada.', 409);
    return Response.json({ ok: true, automaticReplies: false }, { headers });
  } catch (error) {
    return Response.json({ error: error.status ? error.message : 'Não foi possível alterar a automação do Direct.' },
      { status: error.status || 503, headers });
  }
}
