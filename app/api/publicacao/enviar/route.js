import {
  publicationAuth,sameOrigin,requireUuid,NO_STORE,publishError,
  PUBLISH_BUCKET,PUBLISH_WORKSPACE,createInstagramReel
} from '../../../../lib/multichannel-publisher.mjs';
import {uploadPrivateVideoToYoutube} from '../../../../lib/youtube-upload.mjs';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function POST(request){
  let db,ownerId,target,post;
  try{
    sameOrigin(request);
    ({db,ownerId}=await publicationAuth(request));
    const input=await request.json().catch(()=>({}));
    const id=requireUuid(input.id);
    const platform=String(input.platform||'');
    if(!['instagram','youtube'].includes(platform))
      throw Object.assign(new Error('Esta rede ainda não possui publicação automática habilitada.'),{status:409});
    const {data,error}=await db.from('multichannel_posts').select('*')
      .eq('id',id).eq('owner_user_id',ownerId).eq('workspace_id',PUBLISH_WORKSPACE).maybeSingle();
    if(error||!data)throw Object.assign(new Error('Publicação não encontrada.'),{status:404});
    post=data;
    const {data:claimed,error:claimError}=await db.from('multichannel_post_targets')
      .update({state:'sending',updated_at:new Date().toISOString()})
      .eq('post_id',id).eq('platform',platform).eq('state','ready')
      .select('id').maybeSingle();
    if(claimError||!claimed)throw Object.assign(new Error('Este envio já foi iniciado. Confira o status antes de tentar novamente.'),{status:409});
    target=claimed;
    const {data:file,error:fileError}=await db.storage.from(PUBLISH_BUCKET).download(post.storage_path);
    if(fileError||!file||file.size!==Number(post.size_bytes))throw new Error('Arquivo indisponível ou diferente do enviado.');
    let newState,externalId;
    if(platform==='youtube'){
      externalId=await uploadPrivateVideoToYoutube({db,ownerId,file,
        title:post.title,description:post.caption,mimeType:post.mime_type});
      newState='private';
    }else{
      externalId=await createInstagramReel({db,ownerId,row:post});
      newState='processing';
    }
    const {error:storeError}=await db.from('multichannel_post_targets')
      .update({state:newState,external_id:externalId,error_message:null,updated_at:new Date().toISOString()})
      .eq('id',claimed.id).eq('state','sending');
    if(storeError)throw new Error('A rede recebeu o vídeo, mas o TidePlace não confirmou o registro. Confira a rede antes de repetir.');
    return Response.json({platform,state:newState,externalId},{headers:NO_STORE});
  }catch(error){
    if(db&&target){
      // Ambiguous third-party requests MUST NOT retry automatically: avoid duplicate posts.
      await db.from('multichannel_post_targets').update({state:'unknown',
        error_message:'Envio não confirmado. Verifique a conta antes de preparar outro vídeo.',
        updated_at:new Date().toISOString()}).eq('id',target.id).eq('state','sending');
    }
    return publishError(null,error,'Falha ao enviar o vídeo. Confira o status antes de tentar novamente.');
  }
}