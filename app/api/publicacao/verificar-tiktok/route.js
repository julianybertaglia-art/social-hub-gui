import {
 publicationAuth,sameOrigin,requireUuid,publishError,NO_STORE,PUBLISH_WORKSPACE
} from '../../../lib/multichannel-publisher.mjs';
import {checkTikTokTask} from '../../../lib/tiktok-posting.mjs';
export const dynamic='force-dynamic';
export const maxDuration=45;
export async function POST(request){
 try{
  sameOrigin(request);
  const {db,ownerId}=await publicationAuth(request);
  const body=await request.json().catch(()=>({}));
  const id=requireUuid(body.id);
  const {data:post,error:postError}=await db.from('multichannel_posts')
    .select('id,size_bytes').eq('id',id).eq('owner_user_id',ownerId)
    .eq('workspace_id',PUBLISH_WORKSPACE).maybeSingle();
  if(postError||!post)throw Object.assign(new Error('Vídeo não encontrado.'),{status:404});
  const {data:row,error:targetError}=await db.from('multichannel_post_targets')
    .select('id,external_id,state').eq('post_id',id).eq('platform','tiktok').maybeSingle();
  if(targetError||!row||!row.external_id)throw Object.assign(
    new Error('Ainda não há tarefa de envio TikTok confirmada.'),{status:409});
  const state=await checkTikTokTask({db,ownerId,publishId:row.external_id});
  // Only a confirmed TikTok terminal state may replace an ambiguous local
  // upload failure. A PROCESSING_UPLOAD result does NOT mean the video arrived.
  const confirmed=['draft','published','failed'].includes(state.state);
  const shouldStore=confirmed
    ? !['published','failed'].includes(row.state)
    : row.state==='processing';
  if(shouldStore){
    const detail=state.state==='draft'
      ?'TikTok confirmou a entrega do vídeo à caixa de entrada para edição e publicação.'
      :state.state==='failed'?'TikTok não concluiu o envio ('+(state.reason||'erro')+').':
      state.state==='processing'?'O TikTok ainda não confirmou a entrega do vídeo.':null;
    const {error}=await db.from('multichannel_post_targets').update({
      state:state.state,error_message:detail,updated_at:new Date().toISOString()
    }).eq('id',row.id).in('state',['processing','draft','unknown']);
    if(error)throw new Error('TikTok confirmou o status, mas não foi possível salvar no histórico.');
  }
  const totalBytes=Number(post.size_bytes);
  const uploadedBytes=state.uploadedBytes;
  let message;
  if(state.state==='draft')message='TikTok confirmou a entrega à caixa de entrada. Abra a notificação no aplicativo para finalizar o rascunho.';
  else if(state.state==='published')message='TikTok confirmou que o vídeo foi publicado.';
  else if(state.state==='failed')message='O TikTok informou falha ('+(state.reason||'sem motivo informado')+'). Não reenvie sem avaliar.';
  else if(state.status==='PROCESSING_UPLOAD'){
    message=uploadedBytes===null
      ?'TikTok informa PROCESSING_UPLOAD, mas não informou quantos bytes recebeu. Ainda não há confirmação de rascunho.'
      :uploadedBytes===0
      ?'O TikTok registrou a tarefa, mas informa ZERO bytes recebidos. O vídeo ainda não chegou à plataforma.'
      :uploadedBytes<totalBytes
      ?'O TikTok recebeu '+uploadedBytes+' de '+totalBytes+' bytes. A transferência ainda não está completa.'
      :'O TikTok recebeu o arquivo, mas ainda não concluiu o processamento.';
  }else message='O TikTok retornou '+state.status+'. Ainda não há confirmação de entrega à caixa de entrada.';
  return Response.json({state:state.state,status:state.status,reason:state.reason,
    uploadedBytes,totalBytes,message},{headers:NO_STORE});
 }catch(error){return publishError(null,error,'Falha ao consultar o envio TikTok.');}
}