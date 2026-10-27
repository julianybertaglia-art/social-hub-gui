import {getSupabaseAdmin} from '../../whatsapp/lib.js';
import {bearerToken,connectionOwner} from '../../vital-connections/helpers.mjs';
import {buildTikTokAuthUrl,digestTikTokState,newTikTokState,TIKTOK_WORKSPACE,TIKTOK_SCOPE_BASIC,TIKTOK_SCOPE_POSTING} from '../../../lib/tiktok-oauth.mjs';

export const dynamic='force-dynamic';
const cache={'Cache-Control':'private, no-store'};
export async function POST(request) {
  try{
    const origin=request.headers.get('origin');
    if(origin && origin!==new URL(request.url).origin) return Response.json({error:'Origem não autorizada.'},{status:403,headers:cache});
    const db=getSupabaseAdmin();
    const ownerId=await connectionOwner(db,bearerToken(request));
    const body=await request.json().catch(()=>({}));
    const scopes=body?.posting===true?TIKTOK_SCOPE_POSTING:TIKTOK_SCOPE_BASIC;
    const state=newTikTokState();
    const url=buildTikTokAuthUrl(state,scopes);
    const {error}=await db.from('tiktok_oauth_pending').insert({
      state_hash:digestTikTokState(state),owner_user_id:ownerId,workspace_id:TIKTOK_WORKSPACE,
      expires_at:new Date(Date.now()+10*60*1000).toISOString(),
    });
    if(error)throw new Error('Falha ao preparar autorização do TikTok.');
    return Response.json({authorizationUrl:url},{headers:{...cache,
      'Set-Cookie':'tide_tiktok_oauth='+state+'; Path=/api/tiktok; Max-Age=600; HttpOnly; Secure; SameSite=Lax',
    }});
  }catch(error){
    return Response.json({error:error.status?error.message:'Não foi possível iniciar a conexão com o TikTok.'},
      {status:error.status||503,headers:cache});
  }
}
