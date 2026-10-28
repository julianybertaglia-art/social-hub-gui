import {
  publicationAuth,sameOrigin,requireUuid,publishError,NO_STORE,PUBLISH_BUCKET,PUBLISH_WORKSPACE
} from '../../../lib/multichannel-publisher.mjs';
import {uploadTikTokDraft} from '../../../lib/tiktok-posting.mjs';

export const dynamic='force-dynamic';
export const maxDuration=300;

// Explicit user-initiated retry of the SAME stored file.
// Only jobs without a publish_id can be retried. The original code saves
// publish_id BEFORE sending bytes, so this cannot resubmit an acknowledged file.
export async function POST(request){
  let db,claimed;
  try{
    sameOrigin(request);
    const auth=await publicationAuth(request);
    db=auth.db;const ownerId=auth.ownerId;
    const body=await request.json().catch(()=>({}));
    const id=requireUuid(body.id);
    const {data:post,error:postError}=await db.from('multichannel_posts')
      .select('id,storage_path,mime_type,size_bytes').eq('id',id)
      .eq('owner_user_id',ownerId).eq('workspace_id',PUBLISH_WORKSPACE).maybeSingle();
    if(postError||!post)throw Object.assign(new Error('Vídeo não encontrado.'),{status:404});
    const {data:target,error:targetError}=await db.from('multichannel_post_targets')
      .select('id,state,external_id,retry_count')
      .eq('post_id',id).eq('platform','tiktok').maybeSingle();
    if(targetError||!target)throw Object.assign(new Error('Este vídeo não foi destinado ao TikTok.'),{status:404});
    if(!['failed','unknown'].includes(target.state)||target.external_id)
      throw Object.assign(new Error('O TikTok já pode ter recebido este vídeo. Use Verificar no TikTok; não repita o envio.'),{status:409});
    if(Number(target.retry_count)>=2)
      throw Object.assign(new Error('Limite de tentativas atingido. Verifique a causa antes de tentar novamente.'),{status:429});
    const {data:file,error:fileError}=await db.storage.from(PUBLISH_BUCKET).download(post.storage_path);
    if(fileError||!file||file.size!==Number(post.size_bytes))
      throw Object.assign(new Error('Arquivo original não encontrado. Nenhuma tentativa foi realizada.'),{status:422});
    const {data:row,error:claimError}=await db.from('multichannel_post_targets')
      .update({state:'sending',retry_count:Number(target.retry_count)+1,error_message:null,updated_at:new Date().toISOString()})
      .eq('id',target.id).eq('state',target.state).eq('retry_count',target.retry_count)
      .is('external_id',null)
      .select('id').maybeSingle();
    if(claimError||!row)throw Object.assign(
      new Error('Outra tentativa já está em andamento. Atualize o histórico.'),{status:409});
    claimed=row;
    const publishId=await uploadTikTokDraft({db,ownerId,file,mimeType:post.mime_type,
      onInitialized:async(publishId)=>{
        const {data:saved,error}=await db.from('multichannel_post_targets')
          .update({external_id:publishId,updated_at:new Date().toISOString()})
          .eq('id',row.id).eq('state','sending').select('id').maybeSingle();
        if(error||!saved)throw Object.assign(new Error(
          'O TikTok iniciou o envio, mas houve falha ao registrar a tarefa. Não tente novamente.'),{status:503});
      }
    });
    const {error:updateError}=await db.from('multichannel_post_targets').update({
      state:'processing',external_id:publishId,error_message:null,updated_at:new Date().toISOString()
    }).eq('id',row.id).eq('state','sending');
    if(updateError)throw Object.assign(new Error(
      'TikTok recebeu a transferência; verifique a tarefa no histórico antes de repetir.'),{status:503});
    return Response.json({state:'processing',
      message:'Arquivo transferido para o TikTok. Clique em Verificar no TikTok para acompanhar a entrega.'},
      {headers:NO_STORE});
  }catch(error){
    if(db&&claimed){
      const {data:existing}=await db.from('multichannel_post_targets')
        .select('external_id').eq('id',claimed.id).maybeSingle();
      // A saved publish_id means the task may be progressing; never resubmit.
      const safeMessage=error?.status?String(error.message).slice(0,280):
        'A transferência não foi confirmada. Não tente novamente antes de conferir.';
      await db.from('multichannel_post_targets').update({
        state:existing?.external_id?'unknown':error.tiktokStage==='init'?'failed':'unknown',
        error_message:safeMessage,updated_at:new Date().toISOString()
      }).eq('id',claimed.id).eq('state','sending');
    }
    return publishError(null,error,'Não foi possível repetir o envio. Confira o motivo no histórico.');
  }
}