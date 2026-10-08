import { getSupabaseAdmin, getMetaCredentials, WHATSAPP_API_VERSION } from '../whatsapp/lib';
import { WORKSPACE, GUI_INSTAGRAM_ID, SESSION_TTL_MS, fail, publicCandidate,
  selectCandidate, validAppToken, safePhoneId, publicConnection } from './helpers.mjs';

export const APP_ID = process.env.META_WHATSAPP_APP_ID || process.env.META_APP_ID || '1975149819862842';
const APP_SECRET = process.env.META_WHATSAPP_APP_SECRET || process.env.META_APP_SECRET;
const CONNECTIONS = 'workspace_meta_connections';
const SESSIONS = 'workspace_meta_connection_sessions';
const PAGE_FIELDS = 'id,username,name,profile_picture_url,followers_count,media_count';

export async function authorize(request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) throw fail('Entre no TidePlace para acessar as conexões.', 401);
  const db = getSupabaseAdmin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user?.id) throw fail('Sua sessão expirou. Entre novamente no TidePlace.', 401);
  const { data: state, error: stateError } = await db.from('content_items')
    .select('id').eq('title', '__SOCIAL_HUB_STATE__').eq('user_id', data.user.id).maybeSingle();
  if (stateError) throw fail('Não foi possível verificar seu acesso.', 503);
  if (!state) throw fail('Esta conta não tem acesso ao TidePlace.', 403);
  return { db, ownerId: data.user.id };
}

export async function graph(path, token, options = {}) {
  const url = new URL('https://graph.facebook.com/' + WHATSAPP_API_VERSION + '/' + path);
  for (const [key, value] of Object.entries(options.query || {})) {
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: { Authorization: 'Bearer ' + token },
    ...(options.body ? { body: options.body } : {}),
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) {
    const code = Number(result.error?.code) || response.status;
    throw fail('A Meta não concluiu a solicitação (código ' + code + '). Confira a autorização da conta.', 502);
  }
  return result;
}

async function prepare(db, ownerId, platform, candidates) {
  if (!candidates.length) throw fail('A Meta não retornou uma conta da Vital Decor. Confira as contas autorizadas.', 422);
  await clearExpiredSessions(db, ownerId);
  const { data, error } = await db.from(SESSIONS).insert({
    owner_user_id: ownerId, workspace_id: WORKSPACE, platform,
    candidates, status: 'prepared', expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  }).select('id,expires_at').single();
  if (error) throw fail('Não foi possível preparar a conexão no TidePlace.', 503);
  return { pendingId: data.id, expiresAt: data.expires_at, platform,
    candidates: candidates.map(publicCandidate) };
}

async function clearExpiredSessions(db, ownerId) {
  const { error } = await db.from(SESSIONS).update({ status: 'expired', candidates: [] })
    .eq('owner_user_id', ownerId).lt('expires_at', new Date().toISOString())
    .in('status', ['prepared', 'consuming']);
  if (error) throw fail('Não foi possível atualizar as autorizações da Meta.', 503);
}

export async function prepareInstagram(db, ownerId, userToken) {
  if (typeof userToken !== 'string' || userToken.length < 20 || userToken.length > 4096) {
    throw fail('Conclua a autorização do Instagram pela Meta.');
  }
  const secret = APP_SECRET;
  if (!secret) throw fail('A configuração do aplicativo da Meta está pendente.', 503);
  const debug = await graph('debug_token', APP_ID + '|' + secret, { query: { input_token: userToken } });
  if (!validAppToken(debug.data, APP_ID)) throw fail('A autorização da Meta é inválida ou expirou.', 401);
  const exchange = await graph('oauth/access_token', userToken, { query: {
    grant_type: 'fb_exchange_token', client_id: APP_ID, client_secret: secret, fb_exchange_token: userToken,
  } });
  if (!exchange.access_token) throw fail('A Meta não confirmou a autorização do Instagram.', 502);
  const candidates = [];
  let after = '';
  for (let page = 0; page < 10; page += 1) {
    const payload = await graph('me/accounts', exchange.access_token, {
      query: { fields: 'id,name,access_token,instagram_business_account', limit: '100', ...(after ? { after } : {}) },
    });
    for (const item of payload.data || []) {
      const id = String(item.instagram_business_account?.id || '');
      if (!id || id === GUI_INSTAGRAM_ID || !item.access_token) continue;
      const profile = await graph(safePhoneId(id), item.access_token, { query: { fields: PAGE_FIELDS } });
      candidates.push({
        id, name: profile.name || item.name, username: profile.username || '',
        pageName: item.name || '', pageId: String(item.id),
        pictureUrl: profile.profile_picture_url || '', accessToken: item.access_token,
      });
    }
    if (!payload.paging?.next || !payload.paging?.cursors?.after) break;
    after = payload.paging.cursors.after;
  }
  return prepare(db, ownerId, 'instagram', candidates);
}

export async function prepareWhatsApp(db, ownerId, body) {
  const code = typeof body.code === 'string' ? body.code : '';
  if (!code || code.length > 4096) throw fail('Conclua a autorização do WhatsApp pela Meta.');
  const wabaId = safePhoneId(body.wabaId);
  const secret = APP_SECRET;
  if (!secret) throw fail('A configuração do aplicativo da Meta está pendente.', 503);
  const tokenResponse = await fetch('https://graph.facebook.com/' + WHATSAPP_API_VERSION + '/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: APP_ID, client_secret: secret, code }),
    cache: 'no-store', signal: AbortSignal.timeout(20000),
  });
  const token = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !token.access_token) throw fail('A Meta não concluiu a autorização do WhatsApp.', 502);
  const payload = await graph(wabaId + '/phone_numbers', token.access_token, {
    query: { fields: 'id,display_phone_number,verified_name,quality_rating', limit: '100' },
  });
  const primary = await getMetaCredentials();
  const guiPhoneId = String(primary?.phoneNumberId || process.env.META_WHATSAPP_PHONE_NUMBER_ID || '');
  const candidates = (payload.data || []).filter((phone) => String(phone.id) !== guiPhoneId).map((phone) => ({
    id: String(phone.id), name: phone.verified_name || 'WhatsApp Business',
    displayPhoneNumber: phone.display_phone_number || '', wabaId, accessToken: token.access_token,
  }));
  return prepare(db, ownerId, 'whatsapp', candidates);
}

export async function commitConnection(db, ownerId, body) {
  const platform = body.platform;
  if (!['instagram', 'whatsapp'].includes(platform)) throw fail('Canal inválido.');
  const { data: session, error } = await db.from(SESSIONS).select('*')
    .eq('id', String(body.pendingId || '')).eq('owner_user_id', ownerId).maybeSingle();
  if (error) throw fail('Não foi possível verificar a autorização.', 503);
  const candidate = selectCandidate(session, ownerId, platform, String(body.accountId || ''));
  const { data: claimed, error: claimError } = await db.from(SESSIONS).update({ status: 'consuming' })
    .eq('id', session.id).eq('owner_user_id', ownerId).eq('status', 'prepared')
    .gt('expires_at', new Date().toISOString()).select('id').maybeSingle();
  if (claimError || !claimed) throw fail('Esta autorização já foi utilizada. Conecte novamente.', 409);
  try {
    const profile = await graph(safePhoneId(candidate.id), candidate.accessToken, {
      query: { fields: platform === 'instagram' ? PAGE_FIELDS : 'id,display_phone_number,verified_name,quality_rating' },
    });
    if (String(profile.id) !== candidate.id) throw fail('A Meta retornou uma conta diferente da selecionada.', 502);
    if (platform === 'whatsapp') {
      const primary = await getMetaCredentials();
      if (candidate.id === String(primary?.phoneNumberId || process.env.META_WHATSAPP_PHONE_NUMBER_ID || '')) {
        throw fail('Selecione o WhatsApp da Vital Decor.');
      }
    }
    const now = new Date().toISOString();
    const row = {
      owner_user_id: ownerId, workspace_id: WORKSPACE, platform,
      external_account_id: candidate.id, access_token: candidate.accessToken,
      page_id: candidate.pageId || null, waba_id: candidate.wabaId || null,
      username: profile.username || null,
      display_name: profile.name || profile.verified_name || candidate.name,
      picture_url: profile.profile_picture_url || null,
      display_phone_number: profile.display_phone_number || null,
      state: platform === 'whatsapp' ? 'pending_subscription' : 'connected',
      connected_at: now, updated_at: now, automatic_replies_enabled: false,
    };
    const { data: saved, error: saveError } = await db.from(CONNECTIONS)
      .upsert(row, { onConflict: 'owner_user_id,workspace_id,platform' })
      .select('id,platform,display_name,username,picture_url,display_phone_number,state,connected_at').single();
    if (saveError) throw fail('Não foi possível salvar esta conta no TidePlace.', 503);
    if (platform === 'whatsapp') {
      await graph(candidate.wabaId + '/subscribed_apps', candidate.accessToken, { method: 'POST' });
      const { error: markError } = await db.from(CONNECTIONS).update({ state: 'connected' })
        .eq('id', saved.id).eq('owner_user_id', ownerId);
      if (markError) throw fail('A Meta autorizou a conta, mas o TidePlace não confirmou a conexão.', 503);
      saved.state = 'connected';
    }
    const { error: clearError } = await db.from(SESSIONS)
      .update({ status: 'consumed', candidates: [] }).eq('id', session.id).eq('owner_user_id', ownerId);
    if (clearError) throw fail('A conexão foi salva. Atualize a página para confirmar.', 503);
    return { ok: true, connection: publicConnection(saved) };
  } catch (error) {
    await db.from(SESSIONS).update({ status: 'prepared' }).eq('id', session.id).eq('owner_user_id', ownerId);
    throw error;
  }
}

export async function readStatus(db, ownerId) {
  await clearExpiredSessions(db, ownerId);
  const { data, error } = await db.from(CONNECTIONS).select('*')
    .eq('owner_user_id', ownerId).eq('workspace_id', WORKSPACE);
  if (error) throw fail('Não foi possível consultar as conexões da Vital Decor.', 503);
  const connections = [];
  for (const row of data || []) {
    let publicRow = publicConnection(row);
    try {
      await graph(row.external_account_id, row.access_token, {
        query: { fields: row.platform === 'instagram' ? PAGE_FIELDS : 'id,display_phone_number,verified_name' },
      });
    } catch {
      publicRow = { ...publicRow, connected: false, state: 'reauthorization_required' };
    }
    connections.push(publicRow);
  }
  return {
    workspace: WORKSPACE, connections, appId: APP_ID,
    whatsappConfigId: process.env.NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID || '',
    automaticReplies: false,
  };
}
