import {
  publicationAuth,sameOrigin,requireUuid,NO_STORE,PUBLISH_WORKSPACE,
  publishError
} from '../../../lib/multichannel-publisher.mjs';
import {usableTikTokToken} from '../../../lib/tiktok-posting.mjs';
import {TIKTOK_WORKSPACE} from '../../../lib/tiktok-oauth.mjs';

export const dynamic='force-dynamic';
export const maxDuration=60;

// This route only reads account/API state. It never initializes a TikTok
// upload, creates a publish_id, transfers files, or publishes a post.
const clean=value=>String(value||'unknown').replace(/[^a-zA-Z0-9_]/g,'').slice(0,60);
async function probe(url,options){
  try {
    const response=await fetch(url,{
      cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000),
      ...options
    });
    const json=await response.json().catch(()=>({}));
    const code=clean(json?.error?.code || (!response.ok?'http_'+response.status:'missing_code'));
    return {ok:response.ok&&code==='ok',httpStatus:response.status,code,json};
  }catch(error){
    const kind=error?.name==='TimeoutError'?'timeout':'network_error';
    return {ok:false,httpStatus:null,code:kind,json:{}};
  }
}
export async function POST(request){
  try{
    sameOrigin(request);
    const {db,ownerId}=await publicationAuth(request);
    const body=await request.json().catch(()=>({}));
    const id=requireUuid(body.id);
    const {data:post,error:postError}=await db.from('multichannel_posts')
      .select('id,storage_path,size_bytes').eq('id',id)
      .eq('owner_user_id',ownerId).eq('workspace_id',PUBLISH_WORKSPACE).maybeSingle();
    if(postError||!post)throw Object.assign(new Error('Vídeo não encontrado.'),{status:404});
    const {data:target,error:targetError}=await db.from('multichannel_post_targets')
      .select('state,external_id,retry_count,error_message')
      .eq('post_id',id).eq('platform','tiktok').maybeSingle();
    if(targetError||!target)throw Object.assign(new Error('Esse vídeo não foi destinado ao TikTok.'),{status:404});
    const {data:connection,error:connError}=await db.from('tiktok_account_connections')
      .select('open_id,environment,oauth_scopes')
      .eq('owner_user_id',ownerId).eq('workspace_id',TIKTOK_WORKSPACE).maybeSingle();
    if(connError||!connection)throw Object.assign(new Error('Reconecte o TikTok antes de testar a API.'),{status:409});
    const {data:files,error:filesError}=await db.from('multichannel_posts')
      .select('storage_path').eq('id',id).eq('owner_user_id',ownerId).maybeSingle();
    if(filesError||!files)throw Object.assign(new Error('Falha ao localizar o arquivo registrado.'),{status:503});
    const {data:fileList,error:storageError}=await db.storage.from('tide-multichannel-videos')
      .list(post.storage_path.slice(0,post.storage_path.lastIndexOf('/')),{
        search:post.storage_path.split('/').pop(),limit:10
      });
    const filePresent=!storageError&&Array.isArray(fileList)&&fileList.some(x=>x.name===post.storage_path.split('/').pop());
    const status={
      state:target.state,
      taskCreated:Boolean(target.external_id),
      retryCount:target.retry_count||0,
      storedFile:filePresent,
      sandbox:connection.environment==='sandbox',
      scopesGranted:{
        basic:(connection.oauth_scopes||[]).includes('user.info.basic'),
        upload:(connection.oauth_scopes||[]).includes('video.upload'),
        publish:(connection.oauth_scopes||[]).includes('video.publish')
      }
    };
    if(!status.scopesGranted.upload)return Response.json({
      ...status,identity:{ok:false,code:'video_upload_not_granted'},
      creatorInfo:{ok:false,code:'video_upload_not_granted'},
      conclusion:'A conta não concedeu video.upload. Renove as permissões pelo TidePlace.'
    },{headers:NO_STORE});
    const {accessToken}=await usableTikTokToken(db,ownerId,'video.upload');
    const infoUrl='https://open.tiktokapis.com/v2/user/info/?fields=open_id';
    const identity=await probe(infoUrl,{headers:{Authorization:'Bearer '+accessToken}});
    const match=identity.ok&&String(identity.json?.data?.user?.open_id||'')===String(connection.open_id);
    const resultIdentity={ok:Boolean(match),httpStatus:identity.httpStatus,
      code:identity.ok?(match?'ok':'account_mismatch'):identity.code};
    const creator= status.scopesGranted.publish
      ?await probe('https://open.tiktokapis.com/v2/post/publish/creator_info/query/',{
          method:'POST',headers:{
            Authorization:'Bearer '+accessToken,
            'Content-Type':'application/json; charset=UTF-8'
          },body:'{}'
        }):{ok:false,httpStatus:null,code:'video_publish_not_granted'};
    return Response.json({
      ...status,identity:resultIdentity,
      creatorInfo:{ok:creator.ok,httpStatus:creator.httpStatus,code:creator.code},
      conclusion:!filePresent?'O vídeo não está mais no armazenamento do TidePlace.':
        !match?'A API não confirmou a identidade da conta conectada.':
        !creator.ok?'A API de informações do criador retornou '+creator.code+'. Isso não comprova, isoladamente, uma falha no upload de rascunhos.':
        target.external_id?'Existe uma tarefa do TikTok registrada. Consulte o status em vez de reenviar.':
        'Identidade e informações do criador verificadas. O erro anterior continua sem causa detalhada, porque não havia diagnóstico por etapa. Nenhum vídeo foi transferido por esta verificação.'
    },{headers:NO_STORE});
  }catch(error){
    return publishError(null,error,'Não foi possível diagnosticar a conexão TikTok.');
  }
}
