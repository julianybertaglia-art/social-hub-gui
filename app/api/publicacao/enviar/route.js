import {
  publicationAuth,sameOrigin,requireUuid,NO_STORE,publishError,
  PUBLISH_BUCKET,PUBLISH_WORKSPACE,createInstagramReel
} from '../../../lib/multichannel-publisher.mjs';
import {uploadVideoToYoutube} from '../../../lib/youtube-upload.mjs';
import {uploadTikTokDraft,uploadTikTokDirectPost,queryTikTokCreatorInfo} from '../../../lib/tiktok-posting.mjs';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function POST(request){
  let db,ownerId,target,post,platform='',tiktokMode='draft';
  try{
    sameOrigin(request);
    ({db,ownerId}=await publicationAuth(request));
    const input=await request.json().catch(()=>({}));
    const id=requireUuid(input.id);
    platform=String(input.platform||'');
    if(platform==='tiktok'){
      if(input.tiktokMode!==undefined&&!['draft','direct'].includes(input.tiktokMode))
        throw Object.assign(new Error('Escolha rascunho ou Direct Post para o TikTok.'),{status:400});
      tiktokMode=input.tiktokMode==='direct'?'direct':'draft';
    }
    if(!['instagram','youtube','tiktok'].includes(platform))
      throw Object.assign(new Error('Esta rede ainda não possui publicação automática habilitada.'),{status:409});
    const {data,error}=await db.from('multichannel_posts').select('*')
      .eq('id',id).eq('owner_user_id',ownerId).eq('workspace_id',PUBLISH_WORKSPACE).maybeSingle();
    if(error||!data)throw Object.assign(new Error('Publicação não encontrada.'),{status:404});
    post=data;
    const {data:claimed,error:claimError}=await db.from('multichannel_post_targets')
      .update({state:'sending',updated_at:new Date().toISOString()})
      .eq('post_id',id).eq('platform',platform).eq('state','ready')
      .select('id').maybeSingle();
    if(claimError||!claimed)throw Object.assign(new Error('Este envio já foi iniciado. Confira o status antes de tentar novamente.'),{status:409});
    target=claimed;
    const {data:file,error:fileError}=await db.storage.from(PUBLISH_BUCKET).download(post.storage_path);
    if(fileError||!file||file.size!==Number(post.size_bytes))throw new Error('Arquivo indisponível ou diferente do enviado.');
    let newState,externalId,youtubePrivacyStatus=null;
    if(platform==='youtube'){
      const requested= input.youtubePrivacy===undefined?'private':String(input.youtubePrivacy);
      if(!['public','unlisted','private'].includes(requested))
        throw Object.assign(new Error('Escolha uma visibilidade válida para o YouTube.'),{status:400});
      const uploaded=await uploadVideoToYoutube({db,ownerId,file,
        title:post.title,description:post.caption,mimeType:post.mime_type,privacyStatus:requested});
      externalId=uploaded.videoId;
      youtubePrivacyStatus=uploaded.privacyStatus;
      newState=youtubePrivacyStatus==='private'?'private':'published';
    }else if(platform==='tiktok'){
      if(tiktokMode==='direct'){
        if(input.tiktokConsent!==true)
          throw Object.assign(new Error('Confirme o uso de música e o envio do vídeo antes de publicar no TikTok.'),{status:400});
        const disclosure= input.commercialDisclosure===true;
        const brandContent=input.brandContent===true;
        const brandOrganic=input.brandOrganic===true;
        if(input.commercialDisclosure!==undefined&&typeof input.commercialDisclosure!=='boolean')
          throw Object.assign(new Error('A opção de divulgação comercial do TikTok é inválida.'),{status:400});
        if(disclosure&&!brandContent&&!brandOrganic)
          throw Object.assign(new Error('Indique se o vídeo promove sua marca, uma terceira marca ou ambas.'),{status:400});
        if(!disclosure&&(brandContent||brandOrganic))
          throw Object.assign(new Error('Ative a divulgação comercial antes de selecionar uma marca.'),{status:400});
        const creatorInfo=await queryTikTokCreatorInfo({db,ownerId});
        const duration=Number(input.videoDurationSec);
        if(creatorInfo.maxVideoPostDurationSec&&Number.isFinite(duration)&&duration>creatorInfo.maxVideoPostDurationSec)
          throw Object.assign(new Error('Este vídeo ultrapassa o limite de '+creatorInfo.maxVideoPostDurationSec+' segundos da conta TikTok.'),{status:400});
        externalId=await uploadTikTokDirectPost({db,ownerId,file,mimeType:post.mime_type,
          caption:post.caption,privacyLevel:String(input.privacyLevel||''),
          allowComment:input.allowComment===true,allowDuet:input.allowDuet===true,
          allowStitch:input.allowStitch===true,brandContent,brandOrganic,creatorInfo,
          onInitialized:async(publishId)=>{
            const {error}=await db.from('multichannel_post_targets')
              .update({external_id:publishId,updated_at:new Date().toISOString()})
              .eq('id',claimed.id).eq('state','sending');
            if(error)throw new Error('O TikTok iniciou uma publicação, mas o histórico não registrou a tarefa. Confira a conta antes de tentar novamente.');
          }
        });
      }else{
        externalId=await uploadTikTokDraft({db,ownerId,file,mimeType:post.mime_type,
        onInitialized:async(publishId)=>{
          const {error}=await db.from('multichannel_post_targets')
            .update({external_id:publishId,updated_at:new Date().toISOString()})
            .eq('id',claimed.id).eq('state','sending');
          if(error)throw new Error('O TikTok iniciou um envio, mas o histórico não pôde registrá-lo. Confira a conta antes de tentar novamente.');
        }
      });
      }
      newState='processing';
    }else{
      externalId=await createInstagramReel({db,ownerId,row:post});
      newState='processing';
    }
    const {error:storeError}=await db.from('multichannel_post_targets')
      .update({state:newState,external_id:externalId,error_message:null,updated_at:new Date().toISOString()})
      .eq('id',claimed.id).eq('state','sending');
    if(storeError)throw new Error('A rede recebeu o vídeo, mas o TidePlace não confirmou o registro. Confira a rede antes de repetir.');
    return Response.json({platform,state:newState,externalId,mode:platform==='tiktok'?tiktokMode:undefined,
      youtubePrivacyStatus},{headers:NO_STORE});
  }catch(error){
    if(db&&target){
      // An initialized upload already has a saved publish_id; never offer automatic retry.
      // Before initialization we can safely show the sanitized TikTok API error code.
      const isTikTok=platform==='tiktok';
      const reason=isTikTok&&error.status?String(error.message).slice(0,260):
        'Envio não confirmado. Verifique a conta antes de preparar outro vídeo.';
      await db.from('multichannel_post_targets').update({
        state:isTikTok&&error.tiktokStage==='init'?'failed':'unknown',
        error_message:isTikTok&&tiktokMode==='direct'?'[tiktok-direct] '+reason:reason,
        updated_at:new Date().toISOString()}).eq('id',target.id).eq('state','sending');
    }
    return publishError(null,error,'Falha ao enviar o vídeo. Confira o status antes de tentar novamente.');
  }
}
