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
    .select('id').eq('id',id).eq('owner_user_id',ownerId)
    .eq('workspace_id',PUBLISH_WORKSPACE).maybeSingle();
  if(postError||!post)throw Object.assign(new Error('Vídeo não encontrado.'),{status:404});
  const {data:row,error:targetError}=await db.from('multichannel_post_targets')
    .select('id,external_id,state').eq('post_id',id).eq('platform','tiktok').maybeSingle();
  if(targetError||!row||!row.external_id)throw Object.assign(
    new Error('Ainda não há tarefa de envio TikTok confirmada.'),{status:409});
  const state=await checkTikTokTask({db,ownerId,publishId:row.external_id});
  // Do not regress terminal state in case the TikTok API temporarily lags.
  if(!['published','failed','unknown'].includes(row.state)){
    const detail=state.state==='draft'
      ?'Rascunho enviado ao TikTok. Abra a notificação no aplicativo para editar e publicar.'
      :state.state==='failed'?'TikTok não concluiu o processamento ('+(state.reason||'erro')+').':null;
    const {error}=await db.from('multichannel_post_targets').update({
      state:state.state,error_message:detail,updated_at:new Date().toISOString()
    }).eq('id',row.id).in('state',['processing','draft']);
    if(error)throw new Error('TikTok confirmou o status, mas não foi possível salvar no histórico.');
  }
  return Response.json({state:state.state,status:state.status,reason:state.reason,
   message:state.state==='draft'?'Vídeo disponível na caixa de entrada do TikTok para finalizar pelo aplicativo.':
    state.state==='published'?'Publicação confirmada pelo TikTok.':
    state.state==='failed'?'O TikTok informou falha. Confira os detalhes antes de reenviar.':
    'O TikTok ainda está processando o vídeo.'},{headers:NO_STORE});
 }catch(error){return publishError(null,error,'Falha ao consultar o envio TikTok.');}
}