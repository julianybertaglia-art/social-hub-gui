import crypto from 'node:crypto';

export const YOUTUBE_REDIRECT_URI = 'https://social-hub-gui.vercel.app/api/youtube/callback';
export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
];
export const YOUTUBE_WORKSPACE = 'gui-nonato';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export function googleConfiguration() {
  const id = process.env.YOUTUBE_CLIENT_ID?.trim();
  const secret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
  const key = process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY?.trim();
  if (!id || !secret || !key) throw Object.assign(new Error('Credenciais do YouTube ainda não configuradas no servidor.'), { status: 503 });
  const binaryKey = Buffer.from(key, 'base64url');
  if (binaryKey.length !== 32) throw Object.assign(new Error('Chave de criptografia do YouTube inválida.'), { status: 503 });
  return { id, secret, key: binaryKey };
}

export function encryptYoutubeToken(token) {
  const { key } = googleConfiguration();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join(':');
}
export function decryptYoutubeToken(stored) {
  const { key } = googleConfiguration();
  const [version, ivText, tagText, encryptedText] = String(stored).split(':');
  if (version !== 'v1' || !ivText || !tagText || !encryptedText) throw new Error('Token do YouTube inválido.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]).toString('utf8');
}

export function newOauthState() {
  return crypto.randomBytes(32).toString('base64url');
}
export function digestOauthState(state) {
  return crypto.createHash('sha256').update(state, 'utf8').digest('hex');
}
export function buildYoutubeAuthUrl(state) {
  const { id } = googleConfiguration();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: id, response_type: 'code', redirect_uri: YOUTUBE_REDIRECT_URI,
    scope: YOUTUBE_SCOPES.join(' '), state,
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
  }).toString();
  return url.toString();
}

export async function exchangeYoutubeCode(code) {
  const { id, secret } = googleConfiguration();
  const response = await fetch(TOKEN_URL, {
    method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: id, client_secret: secret,
      redirect_uri: YOUTUBE_REDIRECT_URI, grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token || !payload.refresh_token) {
    throw new Error('O Google não confirmou a autorização permanente. Autorize novamente o acesso ao canal.');
  }
  const granted = String(payload.scope || '').split(/\s+/);
  if (!YOUTUBE_SCOPES.every((scope) => granted.includes(scope))) throw new Error('As permissões de publicação e comentários não foram autorizadas.');
  return { accessToken: payload.access_token, refreshToken: payload.refresh_token,
    expiresIn: Number(payload.expires_in) || 3600, scopes: granted };
}

export async function getAuthorizedYoutubeChannel(accessToken) {
  const url = 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=50';
  const response = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken }, cache: 'no-store',
    signal: AbortSignal.timeout(20000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('O YouTube recusou a leitura do canal. Confirme as permissões da conta Google.');
  const channels = Array.isArray(payload.items) ? payload.items : [];
  if (!channels.length) throw new Error('Essa conta Google não retornou nenhum canal do YouTube.');
  if (channels.length !== 1) throw new Error('Mais de um canal foi retornado. Selecione apenas o canal do Gui ao autorizar.');
  const channel = channels[0];
  if (!channel.id || !channel.snippet?.title) throw new Error('O YouTube não retornou a identificação do canal.');
  return { id: channel.id, title: channel.snippet.title,
    thumbnail: channel.snippet.thumbnails?.default?.url || null };
}

export function youtubePublicStatus(row) {
  if (!row) return { connected: false };
  return { connected: true, channelId: row.channel_id, title: row.channel_title,
    thumbnail: row.channel_thumbnail, connectedAt: row.connected_at,
    tokenExpiresAt: row.access_expires_at };
}
