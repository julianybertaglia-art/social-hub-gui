import crypto from 'node:crypto';

export const WORKSPACE = 'vital-decor';
export const GUI_INSTAGRAM_ID = '17841401155694295';
export const SESSION_TTL_MS = 15 * 60 * 1000;

export function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function bearerToken(request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) throw fail('Entre no TidePlace para acessar as conexões.', 401);
  return token;
}

export async function connectionOwner(db, token) {
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user?.id) throw fail('Sua sessão expirou. Entre novamente no TidePlace.', 401);
  const { data: state, error: stateError } = await db.from('content_items')
    .select('id').eq('title', '__SOCIAL_HUB_STATE__').eq('user_id', data.user.id).limit(1).maybeSingle();
  if (stateError) throw fail('Não foi possível verificar seu acesso.', 503);
  if (!state) throw fail('Esta conta não tem acesso ao TidePlace.', 403);
  return data.user.id;
}

export function publicCandidate(item) {
  return {
    id: item.id,
    name: item.name || '',
    username: item.username || '',
    pageName: item.pageName || '',
    pictureUrl: item.pictureUrl || '',
    displayPhoneNumber: item.displayPhoneNumber || '',
  };
}

export function selectCandidate(session, ownerId, platform, accountId, now = Date.now()) {
  const expiresAt = Date.parse(session?.expires_at);
  if (!session || session.owner_user_id !== ownerId || session.platform !== platform
      || session.workspace_id !== WORKSPACE || session.status !== 'prepared'
      || !Number.isFinite(expiresAt) || expiresAt <= now) {
    throw fail('A autorização expirou. Conecte novamente pela Meta.', 409);
  }
  const item = session.candidates?.find((candidate) => candidate.id === accountId);
  if (!item) throw fail('Selecione uma conta presente na autorização da Meta.');
  if (platform === 'instagram' && item.id === GUI_INSTAGRAM_ID) {
    throw fail('Selecione o Instagram da Vital Decor.');
  }
  return item;
}

export function validWebhookSignature(rawBody, header, secrets) {
  if (!/^sha256=[a-f0-9]{64}$/i.test(header || '')) return false;
  return secrets.filter(Boolean).some((secret) => constantEqual(
    header.slice(7).toLowerCase(),
    crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex'),
  ));
}

export function webhookDestination(change, connections, primary) {
  const phoneId = String(change.value?.metadata?.phone_number_id || '');
  const wabaId = String(change.wabaId || '');
  const matches = connections.filter((row) => row.workspace_id === WORKSPACE
    && row.platform === 'whatsapp' && String(row.waba_id) === wabaId
    && ['connected', 'pending_subscription'].includes(row.state));
  if (phoneId) {
    const connection = matches.find((row) => String(row.external_account_id) === phoneId);
    if (connection) return { target: WORKSPACE, connection };
    if (primary && phoneId === String(primary.phoneNumberId)
        && (!primary.wabaId || wabaId === String(primary.wabaId))) return { target: 'primary' };
  } else if (!matches.length && primary?.wabaId && wabaId === String(primary.wabaId)) {
    return { target: 'primary' };
  }
  return { target: 'ignore' };
}

export function validAppToken(data, appId, now = Date.now()) {
  return Boolean(data?.is_valid && String(data.app_id) === String(appId)
    && (!data.expires_at || Number(data.expires_at) * 1000 > now)
    && (!data.data_access_expires_at || Number(data.data_access_expires_at) * 1000 > now));
}

export function safePhoneId(value) {
  const id = String(value || '');
  if (!/^\d{5,40}$/.test(id)) throw fail('A Meta não devolveu uma conta válida.');
  return id;
}

export function constantEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

export function publicConnection(row) {
  if (!row) return null;
  return {
    id: row.id,
    platform: row.platform,
    name: row.display_name,
    username: row.username,
    pictureUrl: row.picture_url,
    displayPhoneNumber: row.display_phone_number,
    state: row.state,
    connected: row.state === 'connected',
    connectedAt: row.connected_at,
    automaticReplies: Boolean(row.automatic_replies_enabled),
  };
}
