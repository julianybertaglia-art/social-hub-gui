import crypto from 'node:crypto';
import { YOUTUBE_WORKSPACE } from '../../../../lib/youtube-oauth.mjs';
import {
  ensureSameOrigin, YOUTUBE_UPLOAD_BUCKET, YOUTUBE_UPLOAD_MAX, YOUTUBE_MIME_TYPES,
  youtubeUploadAuth, NO_CACHE,
} from '../../../../lib/youtube-upload.mjs';

export const dynamic = 'force-dynamic';
export async function POST(request) {
  try {
    ensureSameOrigin(request);
    const {db,ownerId}=await youtubeUploadAuth(request);
    const body=await request.json().catch(()=>({}));
    const title=String(body.title||'').trim();
    const description=String(body.description||'').trim();
    const mimeType=String(body.mimeType||'').toLowerCase();
    const size=Number(body.size);
    if (!title || title.length>100 || description.length>5000)
      return Response.json({error:'Preencha um título de até 100 caracteres e descrição de até 5.000.'},{status:400,headers:NO_CACHE});
    if (!YOUTUBE_MIME_TYPES.includes(mimeType) || !Number.isSafeInteger(size) || size<=0 || size>YOUTUBE_UPLOAD_MAX)
      return Response.json({error:'Selecione um vídeo MP4, WebM ou MOV de até 50 MB.'},{status:400,headers:NO_CACHE});
    const {data:channel,error:channelError}=await db.from('youtube_channel_connections')
      .select('channel_id').eq('owner_user_id',ownerId).eq('workspace_id',YOUTUBE_WORKSPACE).maybeSingle();
    if(channelError || !channel) return Response.json({error:'Conecte primeiro o YouTube do Gui.'},{status:409,headers:NO_CACHE});

    const {count,error:countError}=await db.from('youtube_video_uploads').select('id',{count:'exact',head:true})
      .eq('owner_user_id',ownerId).gt('created_at',new Date(Date.now()-60*60*1000).toISOString());
    if(countError) throw new Error('Não foi possível verificar os envios.');
    if((count||0)>=8) return Response.json({error:'Limite de oito tentativas por hora. Tente novamente mais tarde.'},{status:429,headers:NO_CACHE});

    const id=crypto.randomUUID();
    const extension=mimeType==='video/mp4'?'mp4':mimeType==='video/webm'?'webm':'mov';
    const storagePath=ownerId+'/'+id+'.'+extension;
    const {error:saveError}=await db.from('youtube_video_uploads').insert({
      id,owner_user_id:ownerId,workspace_id:YOUTUBE_WORKSPACE,
      title,description,storage_path:storagePath,mime_type:mimeType,size_bytes:size,state:'awaiting_file',
    });
    if(saveError) throw new Error('Não foi possível criar o envio.');

    const {data:signed,error:signError}=await db.storage.from(YOUTUBE_UPLOAD_BUCKET).createSignedUploadUrl(storagePath);
    if(signError||!signed?.token) {
      await db.from('youtube_video_uploads').delete().eq('id',id).eq('owner_user_id',ownerId);
      throw new Error('Não foi possível preparar o envio do vídeo para o armazenamento.');
    }
    return Response.json({
      id, path:storagePath, uploadToken:signed.token, maxFileSize:YOUTUBE_UPLOAD_MAX,
      channelId:channel.channel_id,
    },{headers:NO_CACHE});
  } catch(error) {
    return Response.json({error:error.status?error.message:'Não foi possível preparar o arquivo para upload.'},
      {status:error.status||503,headers:NO_CACHE});
  }
}
