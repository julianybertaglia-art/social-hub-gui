import {getSupabaseAdmin} from '../../whatsapp/lib.js';
import {digestTikTokState,equalTikTokState,exchangeTikTokCode,tiktokProfile,
 encryptTikTokToken,TIKTOK_WORKSPACE,TIKTOK_REDIRECT_URI} from '../../../lib/tiktok-oauth.mjs';

export const dynamic='force-dynamic';
const cookie='tide_tiktok_oauth=; Path=/api/tiktok; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
function finish(code) {
  const target=new URL('/tiktok/conectar',TIKTOK_REDIRECT_URI);
  target.searchParams.set('connection',code);
  // Create mutable header set directly rather than mutating Response.redirect immutable headers.
  return new Response(null,{status:303,headers:{Location:target.toString(),
    'Cache-Control':'private, no-store','Set-Cookie':cookie}});
}
export async function GET(request) {
  const query=new URL(request.url).searchParams;
  const state=query.get('state')||'';
  const saved=request.cookies.get('tide_tiktok_oauth')?.value||'';
  if(!equalTikTokState(state,saved))return finish('invalid_state');
  if(query.get('error'))return finish('denied');
  const code=query.get('code')||'';
  if(!code||code.length>4096)return finish('error');
  try{
    const db=getSupabaseAdmin();
    const {data:pending,error:pendingError}=await db.from('tiktok_oauth_pending')
      .update({consumed_at:new Date().toISOString()}).eq('state_hash',digestTikTokState(state))
      .eq('workspace_id',TIKTOK_WORKSPACE).is('consumed_at',null)
      .gt('expires_at',new Date().toISOString()).select('owner_user_id,environment').maybeSingle();
    if(pendingError||!pending)return finish('expired');
    const environment=pending.environment==='sandbox'?'sandbox':'production';
    const tokens=await exchangeTikTokCode(code,environment);
    const profile=await tiktokProfile(tokens.accessToken);
    if(profile.openId!==tokens.openId)throw new Error('O TikTok devolveu identificações de conta incompatíveis.');
    const now=Date.now();
    const {error:savingError}=await db.from('tiktok_account_connections').upsert({
      owner_user_id:pending.owner_user_id,workspace_id:TIKTOK_WORKSPACE,environment,
      open_id:tokens.openId,display_name:profile.displayName,avatar_url:profile.avatarUrl,
      oauth_scopes:tokens.scopes,access_token_ciphertext:encryptTikTokToken(tokens.accessToken),
      refresh_token_ciphertext:encryptTikTokToken(tokens.refreshToken),
      access_expires_at:new Date(now+tokens.accessExpiresIn*1000).toISOString(),
      refresh_expires_at:new Date(now+tokens.refreshExpiresIn*1000).toISOString(),
      connected_at:new Date(now).toISOString(),updated_at:new Date(now).toISOString(),
    },{onConflict:'owner_user_id,workspace_id'});
    if(savingError){console.error('TikTok save failed',savingError.code);return finish('save_error');}
    return finish('connected');
  }catch(error){
    console.error('TikTok OAuth failed:',String(error?.message||'unknown').slice(0,160));
    return finish('error');
  }
}
