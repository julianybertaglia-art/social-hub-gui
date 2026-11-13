import crypto from 'node:crypto';
import {
  publicationAuth,sameOrigin,requireUuid,NO_STORE,publishError,PUBLISH_WORKSPACE
} from '../../../lib/multichannel-publisher.mjs';
import {checkTikTokTask} from '../../../lib/tiktok-posting.mjs';

export const dynamic='force-dynamic';
export const maxDuration=45;

// Only PREPARES a fresh, explicitly requested task for an already-saved video.
// Does not upload a byte to TikTok. The client must separately confirm send.
export async function POST(request){
  try{
    sameOrigin(request);
    const {db,ownerId}=await publicationAuth(request);
    const body=await request.json().catch(()=>({}));
    const sourceId=requireUuid(body.id);
    const {data:source,error:sourceError}=await db.from('multichannel_posts')
      .select('id,title,caption,storage_path,mime_type,size_bytes,created_at')
      .eq('id',sourceId).eq('owner_user_id',ownerId)
      .eq('workspace_id',PUBLISH_WORKSPACE).maybeSingle();
    if(sourceError||!source)throw Object.assign(new Error('Arquivo original não encontrado.'),{status:404});
    const {data:target,error:targetError}=await db.from('multichannel_post_targets')
      .select('id,external_id,state')
      .eq('post_id',sourceId).eq('platform','tiktok').maybeSingle();
    if(targetError||!target||target.state!=='unknown'||!target.external_id)
      throw Object.assign(new Error('Use a verificação TikTok antes de preparar outro envio.'),{status:409});
    if(Date.now()-Date.parse(source.created_at)<15*60*1000)
      throw Object.assign(new Error('Esta tarefa é recente. Aguarde a transferência antes de tentar de novo.'),{status:409});
    const status=await checkTikTokTask({db,ownerId,publishId:target.external_id});
    if(status.status!=='PROCESSING_UPLOAD'||status.uploadedBytes!==0)
      throw Object.assign(new Error('TikTok não confirmou zero bytes pendentes. Não criaremos uma tarefa duplicada.'),{status:409});
    const {count,error:limitError}=await db.from('multichannel_posts')
      .select('id',{count:'exact',head:true})
      .eq('owner_user_id',ownerId)
      .gte('created_at',new Date(Date.now()-3600_000).toISOString());
    if(limitError)throw new Error('Limite de tentativas não pôde ser verificado.');
    if((count||0)>=6)throw Object.assign(new Error('Limite de preparações por hora atingido.'),
      {status:429});
    const id=crypto.randomUUID();
    const {error:createdError}=await db.from('multichannel_posts').insert({
      id,owner_user_id:ownerId,workspace_id:PUBLISH_WORKSPACE,
      title:source.title,caption:source.caption,storage_path:source.storage_path,
      mime_type:source.mime_type,size_bytes:source.size_bytes,
      reused_from_post_id:sourceId,
    });
    if(createdError){
      if(createdError.code==='23505')throw Object.assign(new Error(
        'Este vídeo já tem um novo teste preparado. Confira o histórico antes de enviar novamente.'
      ),{status:409});
      throw new Error('Não foi possível preparar uma nova tarefa para o vídeo salvo.');
    }
    const {error:targetInsertError}=await db.from('multichannel_post_targets')
      .insert({post_id:id,platform:'tiktok',state:'ready'});
    if(targetInsertError){
      await db.from('multichannel_posts').delete().eq('id',id).eq('owner_user_id',ownerId);
      throw new Error('Falha ao preparar a rede TikTok. Nenhuma transferência foi iniciada.');
    }
    return Response.json({
      id,originalId:sourceId,state:'ready',
      message:'Vídeo salvo reaproveitado. Nenhum arquivo foi transferido. Confirme o envio pelo botão do histórico.'
    },{headers:NO_STORE});
  }catch(error){return publishError(null,error,'Não foi possível preparar o novo teste TikTok.');}
}