import { YOUTUBE_WORKSPACE } from '../../../lib/youtube-oauth.mjs';
import { NO_CACHE, youtubeUploadAuth, uploadPublicRow } from '../../../lib/youtube-upload.mjs';

export const dynamic = 'force-dynamic';
export async function GET(request) {
  try {
    const {db,ownerId}=await youtubeUploadAuth(request);
    const {data,error}=await db.from('youtube_video_uploads')
      .select('id,title,description,state,youtube_video_id,created_at,error_message')
      .eq('owner_user_id',ownerId).eq('workspace_id',YOUTUBE_WORKSPACE)
      .order('created_at',{ascending:false}).limit(20);
    if(error) throw new Error('Não foi possível buscar o histórico de vídeos.');
    return Response.json({items:(data||[]).map(uploadPublicRow)},{headers:NO_CACHE});
  } catch(error) {
    return Response.json({error:error.status?error.message:'Não foi possível carregar os envios.'},
      {status:error.status||503,headers:NO_CACHE});
  }
}
