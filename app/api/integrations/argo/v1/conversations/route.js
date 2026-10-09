import { authorizeAgent,replyError,noCacheJson } from '../bridge.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request){
 try{
  const ctx=await authorizeAgent(request);
  const url=new URL(request.url);
  const limit=Math.max(1,Math.min(50,Number.parseInt(url.searchParams.get('limit')||'30',10)||30));
  const page=Math.max(1,Math.min(500,Number.parseInt(url.searchParams.get('page')||'1',10)||1));
  const {data:routing,error:routeError,count}=await ctx.db.from('vital_whatsapp_assignments')
   .select('contact_wa_id,sector,status,assigned_to,updated_at',{count:'exact'})
   .eq('connection_id',ctx.connection.id).eq('owner_user_id',ctx.ownerId)
   .eq('assigned_to',ctx.agent).neq('status','closed')
   .order('updated_at',{ascending:false})
   .range((page-1)*limit,page*limit-1);
  if(routeError)throw new Error('Falha ao carregar a fila do Argo');
  const phones=(routing||[]).map(r=>r.contact_wa_id);
  let messages=[];
  if(phones.length){
   const {data,error}=await ctx.db.from('workspace_meta_messages')
    .select('contact_wa_id,profile_name,direction,message_type,body,status,sent_at')
    .eq('connection_id',ctx.connection.id).eq('owner_user_id',ctx.ownerId)
    .in('contact_wa_id',phones).order('sent_at',{ascending:false}).limit(1000);
   if(error)throw new Error('Falha ao carregar mensagens');
   messages=data||[];
  }
  const latest=new Map();
  for(const msg of messages){if(!latest.has(msg.contact_wa_id))latest.set(msg.contact_wa_id,msg);}
  const items=(routing||[]).map(item=>{
   const msg=latest.get(item.contact_wa_id);
   return {contact:item.contact_wa_id,sector:item.sector,status:item.status,assigned_to:item.assigned_to,
    updated_at:item.updated_at,last_message:msg?{body:msg.body,type:msg.message_type,
      direction:msg.direction,status:msg.status,sent_at:msg.sent_at}:null,
    contact_name:msg?.profile_name||null};
  });
  return noCacheJson({workspace:'vital-decor',agent:ctx.agent,page,limit,total:count||0,conversations:items});
 }catch(e){return replyError(e);}
}