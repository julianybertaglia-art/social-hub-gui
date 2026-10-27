import crypto from 'node:crypto';
import {
  publicationAuth,sameOrigin,PUBLISH_WORKSPACE,PUBLISH_MAX_BYTES,PUBLISH_BUCKET,
  NO_STORE,publishError,validateTargetPlatforms,capabilities
} from '../../../../lib/multichannel-publisher.mjs';
export const dynamic='force-dynamic';
export async function POST(request){
  try{
    sameOrigin(request);
    const {db,ownerId}=await publicationAuth(request);
    const body=await request.json().catch(()=>({}));
    const targets=validateTargetPlatforms(body.platforms);
    const title=String(body.title||'').trim(),caption=String(body.caption||'').trim();
    const size=Number(body.size),mime=String(body.mimeType||'');
    if(!title||title.length>100||caption.length>2200)
      throw Object.assign(new Error('Preencha título de até 100 caracteres e legenda de até 2.200.'),{status:400});
    if(mime!=='video/mp4'||!Number.isSafeInteger(size)||size<1||size>PUBLISH_MAX_BYTES)
      throw Object.assign(new Error('Use um vídeo MP4 de até 50 MB.'),{status:400});
    const state=await capabilities(db,ownerId);
    if(targets.includes('instagram')&&!state.instagram.connected)
      throw Object.assign(new Error('Instagram não está conectado. Confira as credenciais Meta.'),{status:409});
    if(targets.includes('youtube')&&!state.youtube.connected)
      throw Object.assign(new Error('YouTube não está conectado. Autorize o canal primeiro.'),{status:409});
    if(targets.length===1&&targets[0]==='tiktok')
      throw Object.assign(new Error('O TikTok está em Sandbox. Selecione também uma rede disponível; postagem pública aguarda aprovação.'),{status:409});
    const {count,error:countError}=await db.from('multichannel_posts').select('id',{count:'exact',head:true})
       .eq('owner_user_id',ownerId).gte('created_at',new Date(Date.now()-3600000).toISOString());
    if(countError)throw new Error('Não foi possível validar o limite de envios.');
    if((count||0)>=6)throw Object.assign(new Error('Limite de seis preparações por hora. Aguarde antes de enviar outro vídeo.'),{status:429});
    const id=crypto.randomUUID(),path=ownerId+'/'+id+'.mp4';
    const {error:saveError}=await db.from('multichannel_posts').insert({
      id,owner_user_id:ownerId,workspace_id:PUBLISH_WORKSPACE,title,caption,storage_path:path,
      mime_type:mime,size_bytes:size
    });
    if(saveError)throw new Error('Não foi possível registrar o novo vídeo.');
    const rows=targets.map(platform=>({post_id:id,platform,
      state:platform==='tiktok'?'pending_approval':'ready',
      error_message:platform==='tiktok'?'O TikTok ainda não concedeu autorização de publicação fora do Sandbox.':null
    }));
    const {error:targetError}=await db.from('multichannel_post_targets').insert(rows);
    if(targetError){await db.from('multichannel_posts').delete().eq('id',id).eq('owner_user_id',ownerId);throw new Error('Não foi possível preparar as redes selecionadas.');}
    const {data:signed,error:signedError}=await db.storage.from(PUBLISH_BUCKET).createSignedUploadUrl(path);
    if(signedError||!signed?.token){
      await db.from('multichannel_posts').delete().eq('id',id).eq('owner_user_id',ownerId);
      throw new Error('Não foi possível preparar o envio do arquivo.');
    }
    return Response.json({id,path,uploadToken:signed.token,bucket:PUBLISH_BUCKET},{headers:NO_STORE});
  }catch(error){return publishError(null,error,'Falha ao preparar a publicação.');}
}