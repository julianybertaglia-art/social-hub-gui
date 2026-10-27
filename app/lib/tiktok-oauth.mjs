import crypto from 'node:crypto';

export const TIKTOK_WORKSPACE = 'gui-nonato';
export const TIKTOK_REDIRECT_URI = 'https://social-hub-gui.vercel.app/api/tiktok/callback';
export const TIKTOK_SCOPE_BASIC = ['user.info.basic'];
export const TIKTOK_SCOPE_POSTING = ['user.info.basic','video.upload','video.publish'];
const TOKEN_ENDPOINT = 'https://open.tiktokapis.com/v2/oauth/token/';

export function tiktokConfigured(environment='production') {
  if (!['production','sandbox'].includes(environment)) return false;
  const names=environment==='sandbox'?['TIKTOK_SANDBOX_CLIENT_KEY','TIKTOK_SANDBOX_CLIENT_SECRET']:['TIKTOK_CLIENT_KEY','TIKTOK_CLIENT_SECRET'];
  return Boolean(names.every(name=>process.env[name]?.trim()) &&
    (process.env.TIKTOK_TOKEN_ENCRYPTION_KEY || process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY)?.trim());
}
export function tiktokConfiguration(environment='production') {
  if(!['production','sandbox'].includes(environment)) throw Object.assign(new Error('Ambiente TikTok inválido.'),{status:400});
  const prefix=environment==='sandbox'?'TIKTOK_SANDBOX_':'TIKTOK_';
  const clientKey = process.env[prefix+'CLIENT_KEY']?.trim();
  const clientSecret = process.env[prefix+'CLIENT_SECRET']?.trim();
  const raw = (process.env.TIKTOK_TOKEN_ENCRYPTION_KEY || process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY)?.trim();
  if(!clientKey || !clientSecret || !raw) {
    throw Object.assign(new Error('Credenciais '+(environment==='sandbox'?'Sandbox':'Production')+' do TikTok ainda não configuradas na Vercel.'),{status:503});
  }
  const source = Buffer.from(raw,'base64url');
  if(source.length!==32) throw Object.assign(new Error('Chave de criptografia TikTok inválida (esperado 32 bytes base64url).'),{status:503});
  // Domain-separate the existing 32-byte server encryption secret from YouTube.
  const encryptionKey = Buffer.from(crypto.hkdfSync('sha256',source,Buffer.from('TidePlace TikTok 2026'),Buffer.from('oauth-tokens:v1'),32));
  return {clientKey,clientSecret,encryptionKey};
}
function tiktokEncryptionKey() {
  const raw=(process.env.TIKTOK_TOKEN_ENCRYPTION_KEY || process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY)?.trim();
  if(!raw)throw new Error('Criptografia TikTok não configurada.');
  const source=Buffer.from(raw,'base64url');
  if(source.length!==32)throw new Error('Chave de criptografia inválida.');
  return Buffer.from(crypto.hkdfSync('sha256',source,Buffer.from('TidePlace TikTok 2026'),Buffer.from('oauth-tokens:v1'),32));
}
export function encryptTikTokToken(token) {
  const encryptionKey = tiktokEncryptionKey();
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',encryptionKey,iv);
  cipher.setAAD(Buffer.from('tideplace:tiktok:v1'));
  const data=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
  return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),data.toString('base64url')].join(':');
}
export function decryptTikTokToken(value) {
  const encryptionKey=tiktokEncryptionKey();
  const [version,iv,tag,encrypted]=String(value||'').split(':');
  if(version!=='v1'||!iv||!tag||!encrypted)throw new Error('Credencial TikTok inválida.');
  const decipher=crypto.createDecipheriv('aes-256-gcm',encryptionKey,Buffer.from(iv,'base64url'));
  decipher.setAAD(Buffer.from('tideplace:tiktok:v1'));
  decipher.setAuthTag(Buffer.from(tag,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted,'base64url')),decipher.final()]).toString('utf8');
}
export const newTikTokState=()=>crypto.randomBytes(32).toString('base64url');
export const digestTikTokState=state=>crypto.createHash('sha256').update(state,'utf8').digest('hex');
export function equalTikTokState(a,b) {
  const one=Buffer.from(String(a||'')),two=Buffer.from(String(b||''));
  return one.length===two.length && one.length>=40 && crypto.timingSafeEqual(one,two);
}
export function buildTikTokAuthUrl(state,scopes=TIKTOK_SCOPE_BASIC,environment='production') {
  const {clientKey}=tiktokConfiguration(environment);
  const url=new URL('https://www.tiktok.com/v2/auth/authorize/');
  url.search=new URLSearchParams({
    client_key:clientKey,scope:scopes.join(','),response_type:'code',
    redirect_uri:TIKTOK_REDIRECT_URI,state,disable_auto_auth:'1',
  }).toString();
  return url.toString();
}
async function tokenRequest(params,environment='production') {
  const {clientKey,clientSecret}=tiktokConfiguration(environment);
  const response=await fetch(TOKEN_ENDPOINT,{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_key:clientKey,client_secret:clientSecret,...params}),
    cache:'no-store',signal:AbortSignal.timeout(20000),
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok||result.error||!result.access_token||!result.refresh_token){
    const reason=String(result.error||'unknown').replace(/[^a-zA-Z0-9_]/g,'').slice(0,45);
    throw new Error('O TikTok recusou a autorização ('+reason+'). Confira o app, as permissões e o Redirect URI.');
  }
  if(!result.open_id||typeof result.open_id!=='string')throw new Error('A resposta do TikTok não identificou a conta autorizada.');
  const scopes=String(result.scope||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(!scopes.includes('user.info.basic'))throw new Error('A conta não autorizou a permissão básica do TikTok.');
  return {
    openId:result.open_id,accessToken:result.access_token,refreshToken:result.refresh_token,
    accessExpiresIn:Math.max(60,Number(result.expires_in)||86400),
    refreshExpiresIn:Math.max(60,Number(result.refresh_expires_in)||31536000),scopes
  };
}
export async function exchangeTikTokCode(code,environment='production') {
  return tokenRequest({code,grant_type:'authorization_code',redirect_uri:TIKTOK_REDIRECT_URI},environment);
}
export async function refreshTikTokToken(refreshToken,environment='production') {
  return tokenRequest({refresh_token:refreshToken,grant_type:'refresh_token'},environment);
}
export async function tiktokProfile(accessToken) {
  const endpoint='https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url';
  const response=await fetch(endpoint,{
    headers:{Authorization:'Bearer '+accessToken},cache:'no-store',
    signal:AbortSignal.timeout(20000),
  });
  const data=await response.json().catch(()=>({}));
  const profile=data?.data?.user;
  if(!response.ok || data?.error?.code!=='ok'||!profile?.open_id){
    throw new Error('O TikTok autorizou, mas não retornou os dados básicos da conta. Confira user.info.basic.');
  }
  return {openId:profile.open_id,displayName:String(profile.display_name||'TikTok').slice(0,200),
    avatarUrl:typeof profile.avatar_url==='string'?profile.avatar_url.slice(0,1600):null};
}
export async function revokeTikTokToken(accessToken,environment='production') {
  const {clientKey,clientSecret}=tiktokConfiguration(environment);
  const response=await fetch('https://open.tiktokapis.com/v2/oauth/revoke/',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_key:clientKey,client_secret:clientSecret,token:accessToken}),
    cache:'no-store',signal:AbortSignal.timeout(20000)
  });
  if(!response.ok)throw new Error('O TikTok não confirmou a revogação. Revogue em TikTok > Configurações > Apps e serviços.');
}
export function tiktokPublicStatus(row) {
  if(!row)return {connected:false};
  return {connected:true,openId:row.open_id,displayName:row.display_name,
    avatarUrl:row.avatar_url,scopes:row.oauth_scopes||[],environment:row.environment||'production',
    connectedAt:row.connected_at,accessExpiresAt:row.access_expires_at};
}
