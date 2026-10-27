import {
 publicationAuth,sameOrigin,requireUuid,publishError,NO_STORE,PUBLISH_WORKSPACE,
 instagramReelProgress,publishInstagramReel
} from '../../../lib/multichannel-publisher.mjs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function POST(request){
  let db,target;
  try{
    sameOrigin(request);
    const {db:client,ownerId}=await publicationAuth(request);db=client;
    const input=await request.json().catch(()=>({})),id=requireUuid(input.id);
    const {data:post,error:postError}=await db.from('multichannel_posts').select('id')
      .eq('id',id).eq('owner_user_id',ownerId).eq('workspace_id',PUBLISH_WORKSPACE).maybeSingle();
    if(postError||!post)throw Object.assign(new Error('Publicação não encontrada.'),{status:404});
    const {data:row,error:targetError}=await db.from('multichannel_post_targets')
      .select('id,external_id,state').eq('post_id',id).eq('platform','instagram').maybeSingle();
    if(targetError||!row||row.state!=='processing')
      throw Object.assign(new Error('O Instagram não está aguardando processamento.'),{status:409});
    const result=await instagramReelProgress(row.external_id);
    if(result.status==='IN_PROGRESS')return Response.json({state:'processing',
      message:'A Meta ainda está processando o Reel. Confira novamente em instantes.'},{headers:NO_STORE});
    if(result.status!=='FINISHED'){
      await db.from('multichannel_post_targets').update({state:'failed',
        error_message:'A Meta retornou o estado '+result.status+'. Confira o Instagram antes de repetir.',
        updated_at:new Date().toISOString()}).eq('id',row.id).eq('state','processing');
      return Response.json({state:'failed',error:'A Meta não concluiu o processamento ('+result.status+').'},{headers:NO_STORE});
    }
    const {data:claimed,error:claimError}=await db.from('multichannel_post_targets')
      .update({state:'sending',updated_at:new Date().toISOString()}).eq('id',row.id).eq('state','processing')
      .select('id').maybeSingle();
    if(claimError||!claimed)throw Object.assign(new Error('Outro envio já está em andamento.'),{status:409});
    target=claimed;
    const mediaId=await publishInstagramReel(result.connection,row.external_id);
    const {error:doneError}=await db.from('multichannel_post_targets')
      .update({state:'published',external_id:mediaId,error_message:null,updated_at:new Date().toISOString()})
      .eq('id',target.id).eq('state','sending');
    if(doneError)throw new Error('Meta confirmou a publicação, mas o registro local falhou. Confira o Instagram.');
    return Response.json({state:'published',mediaId},{headers:NO_STORE});
  }catch(error){
    if(db&&target)await db.from('multichannel_post_targets')
      .update({state:'unknown',error_message:'Resultado incerto. Confira o perfil antes de tentar novamente.',
        updated_at:new Date().toISOString()}).eq('id',target.id).eq('state','sending');
    return publishError(null,error,'Falha ao finalizar Reel; confira o Instagram.');
  }
}