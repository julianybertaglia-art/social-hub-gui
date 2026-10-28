import {
  TIKTOK_WORKSPACE, decryptTikTokToken, encryptTikTokToken, refreshTikTokToken
} from './tiktok-oauth.mjs';

const ROOT='https://open.tiktokapis.com';
const TIKTOK_INIT='/v2/post/publish/inbox/video/init/';
const TIKTOK_STATUS='/v2/post/publish/status/fetch/';

export function safeUploadUrl(value){
  let url;
  try{url=new URL(value);}catch{throw new Error('O TikTok retornou um endereço de upload inválido.');}
  if(url.protocol!=='https:'||url.username||url.password||url.port||
    !(url.hostname==='open-upload.tiktokapis.com'||/^upload\.[a-z]{2}\.tiktokapis\.com$/.test(url.hostname)))
    throw new Error('O TikTok retornou um destino de upload não reconhecido.');
  return url.toString();
}
export function tiktokPostingConfigured(scopes){
  return Array.isArray(scopes)&&scopes.includes('video.upload');
}
export async function usableTikTokToken(db,ownerId,scope='video.upload'){
  const {data:row,error}=await db.from('tiktok_account_connections')
    .select('id,environment,oauth_scopes,open_id,access_token_ciphertext,refresh_token_ciphertext,access_expires_at')
    .eq('owner_user_id',ownerId).eq('workspace_id',TIKTOK_WORKSPACE).maybeSingle();
  if(error||!row)throw Object.assign(new Error('Conecte a conta TikTok do Gui primeiro.'),{status:409});
  if(!row.oauth_scopes?.includes(scope))throw Object.assign(
    new Error('O TikTok ainda não concedeu '+scope+'. Reconecte pelo Sandbox com as novas permissões.'),{status:409});
  if(Date.parse(row.access_expires_at)>Date.now()+120000)
    return {accessToken:decryptTikTokToken(row.access_token_ciphertext),environment:row.environment};
  const updated=await refreshTikTokToken(decryptTikTokToken(row.refresh_token_ciphertext),row.environment);
  if(!updated.scopes.includes(scope))throw Object.assign(
    new Error('A permissão de envio TikTok não foi renovada. Autorize novamente.'),{status:409});
  const {error:saveError}=await db.from('tiktok_account_connections').update({
    access_token_ciphertext:encryptTikTokToken(updated.accessToken),
    refresh_token_ciphertext:encryptTikTokToken(updated.refreshToken),
    oauth_scopes:updated.scopes,
    access_expires_at:new Date(Date.now()+updated.accessExpiresIn*1000).toISOString(),
    refresh_expires_at:new Date(Date.now()+updated.refreshExpiresIn*1000).toISOString(),
    updated_at:new Date().toISOString(),
  }).eq('id',row.id).eq('owner_user_id',ownerId).eq('open_id',updated.openId);
  if(saveError)throw Object.assign(new Error('Não foi possível salvar a renovação do TikTok.'),{status:503});
  return {accessToken:updated.accessToken,environment:row.environment};
}
async function tiktokPost(accessToken,path,body){
  const response=await fetch(ROOT+path,{
    method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json; charset=UTF-8'},
    body:JSON.stringify(body),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok||result?.error?.code!=='ok'){
    const reason=String(result?.error?.code||'request_failed').replace(/[^a-zA-Z0-9_]/g,'').slice(0,56);
    const e=new Error('O TikTok recusou a solicitação ('+reason+'). Verifique as permissões e os limites de envio.');
    e.status=response.status===401?401:response.status===429?429:409;
    e.tiktokStage='init';e.tiktokCode=reason;
    throw e;
  }
  return result.data||{};
}
export async function uploadTikTokDraft({db,ownerId,file,mimeType,onInitialized}){
  const size=file.size;
  if(mimeType!=='video/mp4'||!Number.isSafeInteger(size)||size<1||size>50_000_000)
    throw Object.assign(new Error('Envie um MP4 de até 50 MB.'),{status:400});
  const {accessToken}=await usableTikTokToken(db,ownerId);
  // 50 MB fits TikTok's <=64 MB single-chunk limit; no third-party media URL needed.
  const data=await tiktokPost(accessToken,TIKTOK_INIT,{
    source_info:{source:'FILE_UPLOAD',video_size:size,chunk_size:size,total_chunk_count:1},
  });
  const publishId=String(data.publish_id||'');
  if(!publishId||publishId.length>64||!data.upload_url)
    throw Object.assign(new Error('TikTok não confirmou o identificador da transferência.'),{status:502,tiktokStage:'init'});
  const uploadUrl=safeUploadUrl(data.upload_url);
  if(onInitialized)await onInitialized(publishId);
  const result=await fetch(uploadUrl,{
    method:'PUT',redirect:'error',headers:{
      'Content-Type':mimeType,'Content-Length':String(size),
      'Content-Range':'bytes 0-'+(size-1)+'/'+size
    },body:file,cache:'no-store',signal:AbortSignal.timeout(200000)
  });
  if(result.status!==201)throw Object.assign(new Error(
    'TikTok não confirmou a transferência do arquivo (HTTP '+result.status+'). Use Verificar no TikTok antes de tentar outro envio.'
  ),{status:502,tiktokStage:'transfer'});
  return publishId;
}
export async function checkTikTokTask({db,ownerId,publishId}){
  if(!publishId||publishId.length>64||!/^[a-zA-Z0-9_.~:-]+$/.test(publishId))
    throw Object.assign(new Error('Identificador de envio TikTok inválido.'),{status:400});
  const {accessToken}=await usableTikTokToken(db,ownerId);
  const result=await tiktokPost(accessToken,TIKTOK_STATUS,{publish_id:publishId});
  const status=String(result.status||'UNKNOWN');
  const fail=String(result.fail_reason||'').replace(/[^a-zA-Z0-9_]/g,'').slice(0,64);
  const state=status==='SEND_TO_USER_INBOX'?'draft':
    status==='PUBLISH_COMPLETE'?'published':status==='FAILED'?'failed':'processing';
  return {status,state,reason:fail};
}
