import { authorizeAgent,replyError,noCacheJson } from '../bridge.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request){
 try{
  const ctx=await authorizeAgent(request);
  const {count,error}=await ctx.db.from('vital_whatsapp_assignments')
    .select('contact_wa_id',{head:true,count:'exact'})
    .eq('connection_id',ctx.connection.id).eq('owner_user_id',ctx.ownerId)
    .eq('assigned_to',ctx.agent).neq('status','closed');
  if(error)throw new Error('Erro ao consultar a fila');
  return noCacheJson({ok:true,workspace:'vital-decor',agent:ctx.agent,assigned_conversations:count||0,
    capabilities:['read','reply','poll'],sender:'tideplace',version:'1.0'});
 }catch(e){return replyError(e);}
}