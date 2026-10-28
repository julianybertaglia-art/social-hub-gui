import {
  publicationAuth,sameOrigin,requireUuid,PUBLISH_WORKSPACE,NO_STORE,publishError
} from '../../../lib/multichannel-publisher.mjs';
import {usableYoutubeAccessToken} from '../../../lib/youtube-upload.mjs';

export const dynamic='force-dynamic';
export const maxDuration=45;

// Read-only verification of an upload that was previously confirmed by the YouTube upload API.
// Never publishes, deletes, changes privacy, or creates another video.
export async function POST(request){
  try{
    sameOrigin(request);
    const {db,ownerId}=await publicationAuth(request);
    const body=await request.json().catch(()=>({}));
    const id=requireUuid(body.id);
    const {data:post,error:postError}=await db.from('multichannel_posts')
      .select('id,title').eq('id',id).eq('owner_user_id',ownerId)
      .eq('workspace_id',PUBLISH_WORKSPACE).maybeSingle();
    if(postError||!post)return Response.json({error:'Publicação não encontrada.'},{status:404,headers:NO_STORE});
    const {data:target,error:targetError}=await db.from('multichannel_post_targets')
      .select('external_id,state').eq('post_id',id).eq('platform','youtube').maybeSingle();
    if(targetError||!target)return Response.json({error:'Não há envio do YouTube neste registro.'},{status:404,headers:NO_STORE});
    const videoId=String(target.external_id||'');
    if(!/^[A-Za-z0-9_-]{6,40}$/.test(videoId))
      return Response.json({found:false,reason:'O TidePlace ainda não recebeu um ID confirmado do YouTube.'},{headers:NO_STORE});
    const {accessToken,channelId}=await usableYoutubeAccessToken(db,ownerId);
    const endpoint=new URL('https://www.googleapis.com/youtube/v3/videos');
    endpoint.search=new URLSearchParams({part:'snippet,status,processingDetails',id:videoId}).toString();
    const response=await fetch(endpoint,{
      headers:{Authorization:'Bearer '+accessToken},cache:'no-store',
      signal:AbortSignal.timeout(20000),
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){
      const reason=String(payload?.error?.errors?.[0]?.reason||'').replace(/[^a-zA-Z0-9_]/g,'').slice(0,48);
      return Response.json({error:'Não foi possível consultar o vídeo no YouTube (HTTP '+response.status+(reason?', '+reason:'')+').'},{
        status:502,headers:NO_STORE,
      });
    }
    const video=(payload.items||[]).find(v=>v.id===videoId);
    if(!video) return Response.json({
      found:false,videoId,channelId,
      message:'O YouTube não retornou este vídeo para a conta conectada. Confira se o vídeo foi excluído ou se o canal correto está ativo. Não reenvie antes de verificar.',
    },{headers:NO_STORE});
    const ownerMatches=String(video.snippet?.channelId||'')===String(channelId);
    const privacy=String(video.status?.privacyStatus||'unknown');
    const uploadStatus=String(video.status?.uploadStatus||'unknown');
    const processing=String(video.processingDetails?.processingStatus||'unknown');
    return Response.json({
      found:true,videoId,channelMatches:ownerMatches,
      title:String(video.snippet?.title||'').slice(0,180),
      privacyStatus:privacy,uploadStatus,processingStatus:processing,
      studioUrl:'https://studio.youtube.com/video/'+encodeURIComponent(videoId)+'/edit',
      channelId:channelId,
    },{headers:NO_STORE});
  }catch(error){return publishError(null,error,'Não foi possível verificar o status real no YouTube.');}
}
