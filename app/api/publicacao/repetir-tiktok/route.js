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
  let db,claimed,stage='validando o registro';
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
      .select('id,state,external_id,retry_count,error_message')
      .eq('post_id',id).eq('platform','tiktok').maybeSingle();
    if(targetError||!target)throw Object.assign(new Error('Este vídeo não foi destinado ao TikTok.'),{status:404});
    if(String(target.error_message||'').startsWith('[tiktok-direct] '))
      throw Object.assign(new Error('Este envio foi preparado como Direct Post e não pode ser convertido em rascunho. Reprepare a publicação e confirme as opções do TikTok.'),{status:409});
    if(!['failed','unknown'].includes(target.state)||target.external_id)
      throw Object.assign(new Error('O TikTok já pode ter recebido este vídeo. Use Verificar no TikTok; não repita o envio.'),{status:409});
    if(Number(target.retry_count)>=2)
      throw Object.assign(new Error('Limite de tentativas atingido. Verifique a causa antes de tentar novamente.'),{status:429});
    stage='obtendo o arquivo do armazenamento';
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
    stage='solicitando a inicialização ao TikTok';
    const publishId=await uploadTikTokDraft({db,ownerId,file,mimeType:post.mime_type,
      onInitialized:async(publishId)=>{
        stage='registrando a tarefa do TikTok antes da transferência';
        const {data:saved,error}=await db.from('multichannel_post_targets')
          .update({external_id:publishId,updated_at:new Date().toISOString()})
          .eq('id',row.id).eq('state','sending').select('id').maybeSingle();
        if(error||!saved)throw Object.assign(new Error(
          'O TikTok iniciou o envio, mas houve falha ao registrar a tarefa. Não tente novamente.'),{status:503});
        stage='transferindo o arquivo ao TikTok';
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
      const networkCode=String(error?.cause?.code||'').replace(/[^A-Z0-9_]/g,'').slice(0,32);
      const safeStage=error?.tiktokStage==='init'?'inicialização da tarefa TikTok':
        error?.tiktokStage==='transfer'?'transferência de arquivo':stage;
      const safeMessage=error?.status?String(error.message).slice(0,280):
        'Falha durante '+safeStage+(networkCode?' ('+networkCode+')':'')+
        '. Nenhuma confirmação de transferência; verifique antes de outra tentativa.';
      await db.from('multichannel_post_targets').update({
        state:existing?.external_id?'unknown':error.tiktokStage==='init'?'failed':'unknown',
        error_message:safeMessage,updated_at:new Date().toISOString()
      }).eq('id',claimed.id).eq('state','sending');
    }
    // A sanitized stage is visible to the user even when a runtime fetch/storage
    // exception has no HTTP status; raw exception messages might contain secrets.
    const networkCode=String(error?.cause?.code||'').replace(/[^A-Z0-9_]/g,'').slice(0,32);
    const failure=error?.status?String(error.message).slice(0,280):
      'Falha durante '+stage+(networkCode?' ('+networkCode+')':'')+
      '. Nenhuma transferência confirmada; não repita automaticamente.';
    return Response.json({error:failure},{status:error?.status||502,headers:NO_STORE});
  }
}
