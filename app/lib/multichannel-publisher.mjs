import {getSupabaseAdmin} from '../api/whatsapp/lib.js';
import {bearerToken,connectionOwner} from '../api/vital-connections/helpers.mjs';
import {verifiedGuiInstagram} from './gui-instagram-meta.mjs';
import {TIKTOK_WORKSPACE} from './tiktok-oauth.mjs';

export const PUBLISH_BUCKET='tide-multichannel-videos';
export const PUBLISH_MAX_BYTES=50_000_000;
export const PUBLISH_PLATFORMS=['instagram','youtube','tiktok'];
export const PUBLISH_WORKSPACE='gui-nonato';
export const NO_STORE={'Cache-Control':'private, no-store'};
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function requireUuid(id){
  if(!ID.test(String(id||'')))throw Object.assign(new Error('Publicação inválida.'),{status:400});
  return id;
}
export function validateTargetPlatforms(value){
  if(!Array.isArray(value)||!value.length||value.length>3||
    new Set(value).size!==value.length||value.some(v=>!PUBLISH_PLATFORMS.includes(v)))
    throw Object.assign(new Error('Escolha uma ou mais redes válidas.'),{status:400});
  return value;
}
export function publicTarget(t){
  return {platform:t.platform,state:t.state,externalId:t.external_id||null,
    error:t.error_message||null,updatedAt:t.updated_at};
}
export function publicPost(row){
  return {id:row.id,title:row.title,caption:row.caption,createdAt:row.created_at,
    targets:(row.multichannel_post_targets||[]).map(publicTarget)};
}
export async function publicationAuth(req){
  const db=getSupabaseAdmin();const ownerId=await connectionOwner(db,bearerToken(req));
  return {db,ownerId};
}
export function sameOrigin(req){
  const origin=req.headers.get('origin');
  if(origin&&origin!==new URL(req.url).origin)throw Object.assign(new Error('Origem não autorizada.'),{status:403});
}
export function publishError(response,e,message){
  return Response.json({error:e?.status?e.message:message},{status:e?.status||503,headers:NO_STORE});
}
export async function capabilities(db,ownerId){
  const [youtube,tiktok,instagram]=await Promise.all([
    db.from('youtube_channel_connections').select('channel_title').eq('workspace_id',PUBLISH_WORKSPACE)
      .eq('owner_user_id',ownerId).maybeSingle(),
    db.from('tiktok_account_connections').select('display_name,environment,oauth_scopes')
      .eq('workspace_id',TIKTOK_WORKSPACE).eq('owner_user_id',ownerId).maybeSingle(),
    verifiedGuiInstagram().then(x=>({name:x.profile.username,connected:true}))
      .catch(()=>({connected:false})),
  ]);
  const youtubeConnected=!youtube.error&&Boolean(youtube.data);
  const tiktokConnected=!tiktok.error&&Boolean(tiktok.data);
  const tk=tiktokConnected?tiktok.data:null;
  // A verified video.upload grant allows creator-inbox drafts in Sandbox.
  // Public Direct Post is a separate audited workflow; do not claim it here.
  const tiktokDraft=tiktokConnected&&(tk.oauth_scopes||[]).includes('video.upload');
  return {
    instagram:{connected:instagram.connected,enabled:instagram.connected,
      name:instagram.connected?'@'+instagram.name:'@gui_nonato',
      note:instagram.connected?'Conta reconhecida. A permissão de publicação será conferida pela Meta no envio.':
        'Reconecte o Instagram para utilizar a publicação de Reels.'},
    youtube:{connected:youtubeConnected,enabled:youtubeConnected,
      name:youtube.data?.channel_title||'Gui Nonato',
      note:youtubeConnected?'Envio disponível como privado; vídeos públicos dependem de autorização do Google.':
        'Conecte o canal do YouTube para enviar vídeos privados.'},
    tiktok:{connected:tiktokConnected,enabled:tiktokDraft,mode:'draft',
      name:tk?.display_name||'Gui Nonato',environment:tk?.environment||null,
      note:tiktokDraft?'Envio para rascunho habilitado. Finalize a publicação no aplicativo TikTok.':
        tk?.environment==='sandbox'?'Reconecte pelo Sandbox solicitando video.upload e video.publish.':
        'Conecte o TikTok com a permissão video.upload para enviar rascunhos.'}
  };
}
export function instagramGraphError(payload,status){
  const code=Number(payload?.error?.code||status);
  // Never expose token, signed URL, or private backend response to the browser.
  return new Error('A Meta não concluiu a publicação (código '+code+'). Confira as permissões instagram_content_publish e o formato do vídeo.');
}
export async function instagramCall(connection,path,params={},method='GET'){
  const host=connection.host;
  if(!['graph.instagram.com','graph.facebook.com'].includes(host))throw new Error('Host Meta inválido.');
  const url=new URL('https://'+host+'/v26.0/'+path);
  const options={method,headers:{Authorization:'Bearer '+connection.token},
    cache:'no-store',signal:AbortSignal.timeout(20000)};
  if(method==='POST'){
    options.headers['Content-Type']='application/x-www-form-urlencoded';
    options.body=new URLSearchParams(params);
  }else for(const [key,val] of Object.entries(params))url.searchParams.set(key,String(val));
  const response=await fetch(url,options);
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.error)throw instagramGraphError(data,response.status);
  return data;
}
export async function createInstagramReel({db,ownerId,row}){
  const connection=await verifiedGuiInstagram();
  const {data:signed,error}=await db.storage.from(PUBLISH_BUCKET).createSignedUrl(row.storage_path,60*60*24);
  if(error||!signed?.signedUrl)throw new Error('Não foi possível gerar a URL temporária do vídeo para a Meta.');
  const result=await instagramCall(connection,connection.profile.id+'/media',{
    media_type:'REELS',video_url:signed.signedUrl,caption:row.caption,share_to_feed:'true'
  },'POST');
  if(!/^\d{8,40}$/.test(String(result.id||'')))throw new Error('A Meta não confirmou o container do Reel. Confira antes de tentar novamente.');
  return result.id;
}
export async function instagramReelProgress(containerId){
  if(!/^\d{8,40}$/.test(String(containerId||'')))throw new Error('Container do Instagram inválido.');
  const connection=await verifiedGuiInstagram();
  const result=await instagramCall(connection,containerId,{fields:'status_code'});
  return {connection,status:String(result.status_code||'UNKNOWN').toUpperCase()};
}
export async function publishInstagramReel(connection,containerId){
  const result=await instagramCall(connection,connection.profile.id+'/media_publish',{creation_id:containerId},'POST');
  if(!/^\d{8,40}$/.test(String(result.id||'')))throw new Error('A Meta não confirmou o Reel publicado. Confira o perfil antes de tentar outra vez.');
  return result.id;
}
