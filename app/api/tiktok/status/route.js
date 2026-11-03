import {getSupabaseAdmin} from '../../whatsapp/lib.js';
import {bearerToken,connectionOwner} from '../../vital-connections/helpers.mjs';
import {TIKTOK_WORKSPACE,tiktokConfigured,tiktokPublicStatus,decryptTikTokToken,
 refreshTikTokToken,encryptTikTokToken,revokeTikTokToken} from '../../../lib/tiktok-oauth.mjs';

export const dynamic='force-dynamic';
const cache={'Cache-Control':'private, no-store'};
async function auth(request){
  const db=getSupabaseAdmin();const ownerId=await connectionOwner(db,bearerToken(request));
  return {db,ownerId};
}
export async function GET(request){
  try{
    const {db,ownerId}=await auth(request);
    const {data:row,error}=await db.from('tiktok_account_connections')
      .select('open_id,display_name,avatar_url,oauth_scopes,connected_at,access_expires_at,refresh_expires_at,environment')
      .eq('owner_user_id',ownerId).eq('workspace_id',TIKTOK_WORKSPACE).maybeSingle();
    if(error)throw new Error('A conexão TikTok não pôde ser consultada.');
    const audited=process.env.TIKTOK_DIRECT_POST_AUDITED==='true';
    return Response.json({...tiktokPublicStatus(row),configured:tiktokConfigured(),sandboxConfigured:tiktokConfigured('sandbox'),workspace:TIKTOK_WORKSPACE,
      directPostAudited:audited,reviewRequired:!audited},{headers:cache});
  }catch(error){return Response.json({error:error.status?error.message:'Falha ao consultar a conexão TikTok.'},
    {status:error.status||503,headers:cache});}
}
export async function DELETE(request){
  try{
    const origin=request.headers.get('origin');
    if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Origem não autorizada.'},{status:403,headers:cache});
    const {db,ownerId}=await auth(request);
    const {data:row,error}=await db.from('tiktok_account_connections')
      .select('id,environment,access_token_ciphertext,refresh_token_ciphertext,access_expires_at')
      .eq('owner_user_id',ownerId).eq('workspace_id',TIKTOK_WORKSPACE).maybeSingle();
    if(error)throw new Error('Não foi possível localizar a conta TikTok.');
    if(row){
      let access=decryptTikTokToken(row.access_token_ciphertext);
      if(Date.parse(row.access_expires_at)<=Date.now()){
        const refreshed=await refreshTikTokToken(decryptTikTokToken(row.refresh_token_ciphertext),row.environment||'production');
        access=refreshed.accessToken;
      }
      await revokeTikTokToken(access,row.environment||'production');
      const {error:deleteError}=await db.from('tiktok_account_connections')
        .delete().eq('id',row.id).eq('owner_user_id',ownerId);
      if(deleteError)throw new Error('O TikTok revogou a autorização, mas falhou a exclusão local. Contate o suporte.');
    }
    return Response.json({connected:false},{headers:cache});
  }catch(error){return Response.json({error:error.status?error.message:'Não foi possível desconectar. Revogue o TidePlace também nas configurações do TikTok.'},
    {status:error.status||503,headers:cache});}
}

