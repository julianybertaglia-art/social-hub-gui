import { getSupabaseAdmin } from '../api/whatsapp/lib.js';
import { bearerToken, connectionOwner } from '../api/vital-connections/helpers.mjs';
import { decryptYoutubeToken, encryptYoutubeToken, googleConfiguration, YOUTUBE_WORKSPACE } from './youtube-oauth.mjs';

export const YOUTUBE_UPLOAD_BUCKET = 'tide-youtube-videos';
export const YOUTUBE_UPLOAD_MAX = 50000000;
export const YOUTUBE_MIME_TYPES = ['video/mp4','video/webm','video/quicktime'];
export const NO_CACHE = { 'Cache-Control': 'private, no-store' };

export async function youtubeUploadAuth(request) {
  const db = getSupabaseAdmin();
  const ownerId = await connectionOwner(db, bearerToken(request));
  return {db, ownerId};
}

export function ensureSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    throw Object.assign(new Error('Origem não autorizada.'), {status:403});
  }
}

export function uploadPublicRow(row) {
  return {id:row.id,title:row.title,description:row.description,state:row.state,
    videoId:row.youtube_video_id || null,createdAt:row.created_at,error:row.error_message || null};
}

export async function usableYoutubeAccessToken(db, ownerId) {
  const {data:row,error} = await db.from('youtube_channel_connections')
    .select('id,channel_id,access_token_ciphertext,refresh_token_ciphertext,access_expires_at')
    .eq('owner_user_id',ownerId).eq('workspace_id',YOUTUBE_WORKSPACE).maybeSingle();
  if (error || !row) throw Object.assign(new Error('Conecte o canal YouTube do Gui primeiro.'),{status:409});
  if (Date.parse(row.access_expires_at) > Date.now()+120000)
    return {accessToken:decryptYoutubeToken(row.access_token_ciphertext),channelId:row.channel_id};

  const {id,secret} = googleConfiguration();
  const response = await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({
      client_id:id,client_secret:secret,grant_type:'refresh_token',
      refresh_token:decryptYoutubeToken(row.refresh_token_ciphertext),
    }),cache:'no-store',signal:AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(()=>({}));
  if (!response.ok || !payload.access_token) {
    throw Object.assign(new Error('A autorização do Google expirou. Reconecte o canal na área YouTube.'),{status:401});
  }
  const now = new Date().toISOString();
  const {error:savingError} = await db.from('youtube_channel_connections').update({
    access_token_ciphertext:encryptYoutubeToken(payload.access_token),
    ...(payload.refresh_token?{refresh_token_ciphertext:encryptYoutubeToken(payload.refresh_token)}:{}),
    access_expires_at:new Date(Date.now()+(Number(payload.expires_in)||3600)*1000).toISOString(),
    updated_at:now,
  }).eq('id',row.id).eq('owner_user_id',ownerId);
  if (savingError) throw new Error('Não foi possível renovar a autorização do YouTube.');
  return {accessToken:payload.access_token,channelId:row.channel_id};
}

export async function uploadVideoToYoutube({db,ownerId,file,title,description,mimeType,privacyStatus='private'}) {
  if(!['public','unlisted','private'].includes(privacyStatus))
    throw Object.assign(new Error('Escolha público, não listado ou privado para o YouTube.'),{status:400});
  const {accessToken} = await usableYoutubeAccessToken(db,ownerId);
  const target = new URL('https://www.googleapis.com/upload/youtube/v3/videos');
  target.searchParams.set('uploadType','resumable');
  target.searchParams.set('part','snippet,status');
  const initialize = await fetch(target,{
    method:'POST',
    headers:{
      Authorization:'Bearer '+accessToken,
      'Content-Type':'application/json; charset=UTF-8',
      'X-Upload-Content-Type':mimeType,
      'X-Upload-Content-Length':String(file.size),
    },
    body:JSON.stringify({
      snippet:{title,description,categoryId:'27',defaultLanguage:'pt-BR'},
      status:{privacyStatus,selfDeclaredMadeForKids:false},
    }),cache:'no-store',signal:AbortSignal.timeout(30000),
  });
  if (!initialize.ok) {
    const payload = await initialize.json().catch(()=>({}));
    const reason = String(payload?.error?.errors?.[0]?.reason || '');
    throw new Error('O YouTube recusou o início do envio (HTTP '+initialize.status+(reason?', '+reason:'')+'). Confira a cota e as permissões.');
  }
  const location=initialize.headers.get('location')||'';
  let uploadUri;
  try { uploadUri=new URL(location); } catch { throw new Error('O YouTube não forneceu o endereço de upload.'); }
  if (uploadUri.protocol!=='https:' || uploadUri.hostname!=='www.googleapis.com' ||
      !uploadUri.pathname.startsWith('/upload/youtube/v3/videos')) {
    throw new Error('O YouTube retornou um endereço de upload inesperado.');
  }
  const result=await fetch(uploadUri,{
    method:'PUT',
    headers:{'Content-Type':mimeType,'Content-Length':String(file.size),Authorization:'Bearer '+accessToken},
    body:file,
    cache:'no-store',
    signal:AbortSignal.timeout(240000),
  });
  if(!result.ok) {
    const payload=await result.json().catch(()=>({}));
    const reason=String(payload?.error?.errors?.[0]?.reason||'');
    throw new Error(result.status===308?'O YouTube não concluiu o upload do vídeo.':
      'O envio falhou no YouTube (HTTP '+result.status+(reason?', '+reason:'')+'). Verifique antes de repetir para evitar duplicação.');
  }
  const data=await result.json().catch(()=>({}));
  if(!data.id || !/^[A-Za-z0-9_-]{6,40}$/.test(data.id)) throw new Error('O Google recebeu o arquivo, mas não confirmou um ID de vídeo. Verifique o YouTube Studio antes de tentar novamente.');
  return {videoId:data.id,privacyStatus:['public','unlisted','private'].includes(data.status?.privacyStatus)
    ?data.status.privacyStatus:privacyStatus};
}

// Retain the existing private-only helper for older upload flows.
export async function uploadPrivateVideoToYoutube(args) {
  return (await uploadVideoToYoutube({...args,privacyStatus:'private'})).videoId;
}

