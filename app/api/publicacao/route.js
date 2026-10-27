import {publicationAuth,capabilities,publicPost,NO_STORE,publishError,PUBLISH_WORKSPACE} from '../../lib/multichannel-publisher.mjs';
export const dynamic='force-dynamic';
export async function GET(request){
  try{
    const {db,ownerId}=await publicationAuth(request);
    const [status,history]=await Promise.all([
      capabilities(db,ownerId),
      db.from('multichannel_posts').select('id,title,caption,created_at,multichannel_post_targets(platform,state,external_id,error_message,updated_at)')
        .eq('owner_user_id',ownerId).eq('workspace_id',PUBLISH_WORKSPACE)
        .order('created_at',{ascending:false}).limit(25)
    ]);
    if(history.error)throw new Error('Não foi possível consultar o histórico.');
    return Response.json({capabilities:status,items:(history.data||[]).map(publicPost)},{headers:NO_STORE});
  }catch(error){return publishError(null,error,'Não foi possível carregar o publicador.');}
}