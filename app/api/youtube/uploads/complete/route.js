import { YOUTUBE_WORKSPACE } from '../../../../lib/youtube-oauth.mjs';
import {
  ensureSameOrigin, NO_CACHE, YOUTUBE_UPLOAD_BUCKET, youtubeUploadAuth, uploadPrivateVideoToYoutube,
  uploadPublicRow,
} from '../../../../lib/youtube-upload.mjs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request) {
  let db,ownerId,row;
  try {
    ensureSameOrigin(request);
    ({db,ownerId}=await youtubeUploadAuth(request));
    const body=await request.json().catch(()=>({}));
    const id=String(body.id||'');
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      return Response.json({error:'Envio inválido.'},{status:400,headers:NO_CACHE});
    const {data,error}=await db.from('youtube_video_uploads').select('*').eq('id',id)
      .eq('owner_user_id',ownerId).eq('workspace_id',YOUTUBE_WORKSPACE).maybeSingle();
    if(error || !data) return Response.json({error:'Envio não encontrado.'},{status:404,headers:NO_CACHE});
    if(data.state!=='awaiting_file') return Response.json({
      error:'Este envio já foi processado ou iniciado. Confira a lista antes de tentar novamente.',
    },{status:409,headers:NO_CACHE});
    row=data;
    const {data:file,error:downloadError}=await db.storage.from(YOUTUBE_UPLOAD_BUCKET).download(row.storage_path);
    if(downloadError || !file) return Response.json({
      error:'O arquivo ainda não chegou ao armazenamento. Reenvie-o pelo formulário.',
    },{status:422,headers:NO_CACHE});
    if(file.size!==Number(row.size_bytes)) return Response.json({
      error:'Tamanho do arquivo recebido não corresponde ao original.',
    },{status:422,headers:NO_CACHE});

    const {data:claimed,error:claimError}=await db.from('youtube_video_uploads')
      .update({state:'uploading_to_youtube',updated_at:new Date().toISOString()})
      .eq('id',id).eq('owner_user_id',ownerId).eq('state','awaiting_file')
      .select('id').maybeSingle();
    if(claimError||!claimed) return Response.json({
      error:'Este upload já está em andamento.',
    },{status:409,headers:NO_CACHE});

    const videoId=await uploadPrivateVideoToYoutube({
      db,ownerId,file,title:row.title,description:row.description,mimeType:row.mime_type,
    });
    const {data:saved,error:saveError}=await db.from('youtube_video_uploads')
      .update({state:'uploaded_private',youtube_video_id:videoId,error_message:null,updated_at:new Date().toISOString()})
      .eq('id',id).eq('owner_user_id',ownerId)
      .select('id,title,description,state,youtube_video_id,created_at,error_message').single();
    if(saveError) throw new Error('O YouTube recebeu o vídeo, mas o TidePlace não conseguiu atualizar o histórico. Confira o YouTube Studio antes de repetir.');
    return Response.json({ok:true,video:uploadPublicRow(saved)}, {headers:NO_CACHE});
  } catch(error) {
    const msg=String(error.message||'Falha ao enviar o vídeo ao YouTube.').slice(0,280);
    if(db && ownerId && row) {
      await db.from('youtube_video_uploads').update({
        state:'failed',error_message:msg,updated_at:new Date().toISOString(),
      }).eq('id',row.id).eq('owner_user_id',ownerId).eq('state','uploading_to_youtube');
    }
    return Response.json({error:error.status?error.message:msg},
      {status:error.status||503,headers:NO_CACHE});
  }
}
