import {
  TIKTOK_WORKSPACE, decryptTikTokToken, encryptTikTokToken, refreshTikTokToken
} from './tiktok-oauth.mjs';

const ROOT='https://open.tiktokapis.com';
const TIKTOK_INBOX_INIT='/v2/post/publish/inbox/video/init/';
const TIKTOK_DIRECT_INIT='/v2/post/publish/video/init/';
const TIKTOK_CREATOR_INFO='/v2/post/publish/creator_info/query/';
const TIKTOK_STATUS='/v2/post/publish/status/fetch/';

// TikTok documentation shows open-upload.tiktokapis.com and
// upload.us.tiktokapis.com, but the API may return a different regional
// upload host. Accept only upload-named subdomains of TikTok's documented
// tiktokapis.com service domain. Never accept an arbitrary TikTok-owned CDN,
// third-party domain, URL credentials, insecure scheme, or redirected upload.
export function safeUploadUrl(value){
  let url;
  try{url=new URL(value);}catch{throw Object.assign(new Error(
    'O TikTok retornou uma URL de upload inválida.'),{status:502,tiktokStage:'upload_url'});}
  const hostname=url.hostname.toLowerCase();
  const tikTokServiceDomain=hostname.endsWith('.tiktokapis.com') &&
    hostname!=='tiktokapis.com';
  const subdomain=tikTokServiceDomain?
    hostname.slice(0,-'.tiktokapis.com'.length):'';
  const uploadHost=/^(?:[a-z0-9-]*[-.])?upload(?:[-.][a-z0-9-]+)*$/.test(subdomain);
  const safeHost=/^[a-z0-9.-]{1,140}$/.test(hostname)?hostname:'não_identificado';
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||
    !tikTokServiceDomain||!uploadHost){
    // Report the HOST ONLY, never the query string (which carries upload_token).
    throw Object.assign(new Error(
      'O TikTok retornou um destino de upload não autorizado (domínio: '+safeHost+
      '). Nenhum byte foi enviado.'),{status:502,tiktokStage:'upload_url'});
  }
  return url.toString();
}
/**
 * The TikTok media guide requires 5–64MB chunks, except videos under 5MB.
 * A final chunk may be larger than chunk_size (up to 128MB).
 * For 31MB this returns 3 parts of 10MB / 10MB / 11MB.
 */
export function tikTokUploadPlan(size){
  if(!Number.isSafeInteger(size)||size<=0||size>50_000_000)
    throw Object.assign(new Error('Tamanho do vídeo TikTok inválido.'),{status:400});
  // 10,000,000 bytes follows the official guide's example exactly and avoids
  // differing server interpretations of the 5 MB minimum at the boundary.
  // Under 10MB we send the entire file; above it the last part absorbs the tail.
  const CHUNK_BYTES=10_000_000;
  const numParts=Math.max(1,Math.floor(size/CHUNK_BYTES));
  const chunkSize=numParts===1?size:CHUNK_BYTES;
  if(numParts>1000)throw Object.assign(new Error('Número de partes excedido.'),{status:400});
  const parts=Array.from({length:numParts},(_,i)=>{
    const start=i*chunkSize;
    const end=i===numParts-1?size:Math.min(start+chunkSize,size);
    return {index:i,start,end,size:end-start,last:i===numParts-1};
  });
  return {videoSize:size,chunkSize,totalChunkCount:numParts,parts};
}
export function tiktokPostingConfigured(scopes){
  return Array.isArray(scopes)&&scopes.includes('video.upload');
}
export function tiktokDirectPostingConfigured(scopes){
  return Array.isArray(scopes)&&scopes.includes('video.publish');
}
export function tiktokDirectPostAudited(){
  return process.env.TIKTOK_DIRECT_POST_AUDITED==='true';
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
export async function queryTikTokCreatorInfo({db,ownerId}){
  const {accessToken}=await usableTikTokToken(db,ownerId,'video.publish');
  const info=await tiktokPost(accessToken,TIKTOK_CREATOR_INFO,{});
  const rawOptions=Array.isArray(info.privacy_level_options)?info.privacy_level_options:[];
  const validOptions=['PUBLIC_TO_EVERYONE','MUTUAL_FOLLOW_FRIENDS','FOLLOWER_OF_CREATOR','SELF_ONLY'];
  const options=rawOptions.filter(value=>validOptions.includes(value));
  if(!options.length)throw Object.assign(new Error('O TikTok não retornou opções de privacidade para esta conta.'),{status:409});
  const audited=tiktokDirectPostAudited();
  const publicAccount=options.includes('PUBLIC_TO_EVERYONE');
  const privacyLevelOptions=audited?options:(publicAccount?[]:options.filter(value=>value==='SELF_ONLY'));
  return {
    creatorNickname:String(info.creator_nickname||'Conta TikTok').slice(0,120),
    creatorUsername:String(info.creator_username||'').slice(0,120),
    creatorAvatarUrl:typeof info.creator_avatar_url==='string'?info.creator_avatar_url.slice(0,1600):null,
    privacyLevelOptions,
    commentDisabled:info.comment_disabled===true,
    duetDisabled:info.duet_disabled===true,
    stitchDisabled:info.stitch_disabled===true,
    maxVideoPostDurationSec:Number.isSafeInteger(info.max_video_post_duration_sec)&&info.max_video_post_duration_sec>0
      ?info.max_video_post_duration_sec:null,
    audited,publicAccount,
    canDirectPost:privacyLevelOptions.length>0,
  };
}
async function tiktokPost(accessToken,path,body){
  const response=await fetch(ROOT+path,{
    method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json; charset=UTF-8'},
    body:JSON.stringify(body),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok||result?.error?.code!=='ok'){
    const reason=String(result?.error?.code||'request_failed').replace(/[^a-zA-Z0-9_]/g,'').slice(0,56);
    // TikTok's error.message explains which field is invalid. Use only a
    // tightly allowlisted summary, never a URL, token or raw server response.
    const rawMessage=String(result?.error?.message||'');
    const detail=rawMessage.length<=180&&/^[a-zA-Z0-9 _.,:;()\-]+$/.test(rawMessage)
      ?' Detalhe: '+rawMessage : '';
    const logId=String(result?.error?.log_id||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,64);
    const e=new Error('O TikTok recusou os parâmetros ('+reason+').'+detail+
      (logId?' Referência: '+logId+'.':''));
    e.status=response.status===401?401:response.status===429?429:409;
    e.tiktokStage=path.endsWith('/init/')?'init':'status';e.tiktokCode=reason;
    throw e;
  }
  return result.data||{};
}
async function transferTikTokVideo({accessToken,file,mimeType,initPath,sourceInfo,onInitialized,postInfo}){
  const data=await tiktokPost(accessToken,initPath,{
    ...(postInfo?{post_info:postInfo}:{}),source_info:sourceInfo,
  });
  const publishId=String(data.publish_id||'');
  if(!publishId||publishId.length>64)
    throw Object.assign(new Error('TikTok não confirmou o identificador da transferência.'),{status:502,tiktokStage:'init'});
  // Save the task ID before examining the URL or transmitting bytes. A saved
  // task must never be replaced by a blind retry if transfer becomes ambiguous.
  if(onInitialized)await onInitialized(publishId);
  if(!data.upload_url)throw Object.assign(new Error('O TikTok não devolveu a URL de upload.'),{status:502,tiktokStage:'upload_url'});
  let uploadUrl;
  try{
    uploadUrl=safeUploadUrl(data.upload_url);
  }catch(error){
    // Preserve the sanitized hostname to distinguish an unfamiliar regional
    // TikTok upload endpoint from a genuinely unsafe destination.
    if(error?.tiktokStage==='upload_url')throw error;
    throw Object.assign(new Error('O TikTok retornou um endereço de upload inválido. Nenhum byte foi enviado.'),
      {status:502,tiktokStage:'upload_url'});
  }

  const plan=tikTokUploadPlan(file.size);
  for(const part of plan.parts){
    const buffer=Buffer.from(await file.slice(part.start,part.end).arrayBuffer());
    if(buffer.length!==part.size)
      throw Object.assign(new Error('Parte local do vídeo com tamanho inesperado.'),
        {status:422,tiktokStage:'transfer'});
    const expected=part.last?201:206;
    let result;
    try{
      result=await fetch(uploadUrl,{
        method:'PUT',redirect:'error',headers:{
          'Content-Type':mimeType,
          'Content-Length':String(part.size),
          'Content-Range':'bytes '+part.start+'-'+(part.end-1)+'/'+file.size,
        },
        body:buffer,
        cache:'no-store',
        signal:AbortSignal.timeout(30000),
      });
    }catch(error){
      const reason=String(error?.cause?.code||error?.name||'network_error')
        .replace(/[^a-zA-Z0-9_]/g,'').slice(0,42);
      throw Object.assign(new Error('Falha de conexão com o TikTok na parte '+
        (part.index+1)+'/'+plan.totalChunkCount+' ('+reason+'). Não inicie nova tarefa antes de conferir o status.'),
        {status:502,tiktokStage:'transfer',chunkIndex:part.index+1});
    }
    if(result.status!==expected){
      throw Object.assign(new Error('TikTok respondeu HTTP '+result.status+' na parte '+
        (part.index+1)+'/'+plan.totalChunkCount+'. Envio não concluído; verifique os bytes recebidos antes de tentar novamente.'),
        {status:502,tiktokStage:'transfer',chunkIndex:part.index+1});
    }
  }
  return publishId;
}
export async function uploadTikTokDraft({db,ownerId,file,mimeType,onInitialized}){
  const size=file.size;
  if(mimeType!=='video/mp4'||!Number.isSafeInteger(size)||size<1||size>50_000_000)
    throw Object.assign(new Error('Envie um MP4 de até 50 MB.'),{status:400});
  const {accessToken}=await usableTikTokToken(db,ownerId);
  // 50 MB fits TikTok's <=64 MB single-chunk limit; no third-party media URL needed.
  const plan=tikTokUploadPlan(size);
  return transferTikTokVideo({accessToken,file,mimeType,initPath:TIKTOK_INBOX_INIT,
    sourceInfo:{source:'FILE_UPLOAD',video_size:size,chunk_size:plan.chunkSize,
      total_chunk_count:plan.totalChunkCount},onInitialized});
}
export async function uploadTikTokDirectPost({db,ownerId,file,mimeType,caption,privacyLevel,
  allowComment=false,allowDuet=false,allowStitch=false,brandContent=false,brandOrganic=false,
  creatorInfo,onInitialized}){
  const size=file.size;
  if(mimeType!=='video/mp4'||!Number.isSafeInteger(size)||size<1||size>50_000_000)
    throw Object.assign(new Error('Envie um MP4 de até 50 MB.'),{status:400});
  if(typeof caption!=='string'||caption.length>2200)
    throw Object.assign(new Error('A legenda do TikTok deve ter até 2.200 caracteres.'),{status:400});
  if(typeof privacyLevel!=='string'||!creatorInfo?.privacyLevelOptions?.includes(privacyLevel))
    throw Object.assign(new Error('Escolha uma opção de privacidade retornada pelo TikTok.'),{status:400});
  for(const value of [allowComment,allowDuet,allowStitch,brandContent,brandOrganic])
    if(typeof value!=='boolean')throw Object.assign(new Error('As configurações de publicação do TikTok são inválidas.'),{status:400});
  if((creatorInfo.commentDisabled&&allowComment)||(creatorInfo.duetDisabled&&allowDuet)||
      (creatorInfo.stitchDisabled&&allowStitch))
    throw Object.assign(new Error('Uma interação escolhida está desativada nas configurações atuais da conta TikTok.'),{status:409});
  if(brandContent&&!['PUBLIC_TO_EVERYONE','MUTUAL_FOLLOW_FRIENDS'].includes(privacyLevel))
    throw Object.assign(new Error('Conteúdo de marca exige visibilidade pública ou para amigos no TikTok.'),{status:400});
  if(!creatorInfo.audited&&(!creatorInfo.canDirectPost||creatorInfo.publicAccount||privacyLevel!=='SELF_ONLY'))
    throw Object.assign(new Error('Até a auditoria, o Direct Post só pode enviar para uma conta privada com visibilidade “Somente eu”. Use o fluxo de rascunho ou ajuste a conta.'),{status:409});
  const {accessToken}=await usableTikTokToken(db,ownerId,'video.publish');
  const plan=tikTokUploadPlan(size);
  const postInfo={privacy_level:privacyLevel,disable_comment:!allowComment,
    disable_duet:!allowDuet,disable_stitch:!allowStitch,
    brand_content_toggle:brandContent,brand_organic_toggle:brandOrganic};
  if(caption)postInfo.title=caption;
  return transferTikTokVideo({accessToken,file,mimeType,initPath:TIKTOK_DIRECT_INIT,
    sourceInfo:{source:'FILE_UPLOAD',video_size:size,chunk_size:plan.chunkSize,
      total_chunk_count:plan.totalChunkCount},onInitialized,
    // The direct endpoint needs post metadata as well as the upload source.
    postInfo});
}
export async function checkTikTokTask({db,ownerId,publishId}){
  if(!publishId||publishId.length>64||!/^[a-zA-Z0-9_.~:-]+$/.test(publishId))
    throw Object.assign(new Error('Identificador de envio TikTok inválido.'),{status:400});
  const mode=publishId.startsWith('v_pub')?'direct':'draft';
  const {accessToken}=await usableTikTokToken(db,ownerId,mode==='direct'?'video.publish':'video.upload');
  const result=await tiktokPost(accessToken,TIKTOK_STATUS,{publish_id:publishId});
  const status=String(result.status||'UNKNOWN').replace(/[^A-Z_]/g,'').slice(0,48);
  const fail=String(result.fail_reason||'').replace(/[^a-zA-Z0-9_]/g,'').slice(0,64);
  const uploadedBytes=Number.isSafeInteger(result.uploaded_bytes)&&result.uploaded_bytes>=0?
    result.uploaded_bytes:null;
  const state=status==='SEND_TO_USER_INBOX'?'draft':
    status==='PUBLISH_COMPLETE'?'published':status==='FAILED'?'failed':'processing';
  return {status,state,reason:fail,uploadedBytes,mode};
}

