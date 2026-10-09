import { authorize } from '../../vital-connections/service';
import { fail } from '../vital-connections/helpers.mjs';
import { createBridgeSecret, vitalConnection, AGENTS,
  requireSameOrigin,replyError,noCacheJson } from '../../integrations/argo/v1/bridge.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request){
 try{
  const {db,ownerId}=await authorize(request);
  const connection=await vitalConnection(db,ownerId);
  const {data,error}=await db.from('vital_whatsapp_argo_keys')
   .select('id,agent,label,prefix,expires_at,revoked_at,created_at,last_used_at')
   .eq('owner_user_id',ownerId).eq('connection_id',connection.id)
   .order('created_at',{ascending:false}).limit(30);
  if(error)throw fail('Falha ao consultar chaves da integração.',503);
  return noCacheJson({workspace:'vital-decor',keys:data||[]});
 }catch(e){return replyError(e);}
}
export async function POST(request){
 try{
  requireSameOrigin(request);
  const {db,ownerId}=await authorize(request);
  const connection=await vitalConnection(db,ownerId);
  const payload=await request.json();
  if(payload?.action==='issue'){
   const agent=String(payload.agent||'');
   if(!AGENTS.includes(agent))throw fail('Atendente inválido.',400);
   const {prefix,token,digest}=createBridgeSecret();
   const expiresAt=new Date(Date.now()+90*86400000).toISOString();
   const {data,error}=await db.from('vital_whatsapp_argo_keys').insert({
    connection_id:connection.id,owner_user_id:ownerId,agent,
    label:'Argo - '+agent,prefix,secret_hash:digest,expires_at:expiresAt
   }).select('id').single();
   if(error)throw fail('Falha ao emitir chave.',503);
   return noCacheJson({token,credentialId:data.id,agent,expiresAt},201);
  }
  if(payload?.action==='revoke'){
   const id=String(payload.keyId||'');
   if(!/^[0-9a-f-]{36}$/i.test(id))throw fail('ID inválido.',400);
   const {data,error}=await db.from('vital_whatsapp_argo_keys')
    .update({revoked_at:new Date().toISOString()}).eq('id',id)
    .eq('owner_user_id',ownerId).eq('connection_id',connection.id)
    .select('id').maybeSingle();
   if(error||!data)throw fail('Chave não encontrada.',404);
   return noCacheJson({ok:true});
  }
  throw fail('Ação inválida.',400);
 }catch(e){return replyError(e);}
}