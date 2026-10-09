import { authorizeAgent,assignedContact,replyError,noCacheJson,
  canReplyWithinWindow,WHATSAPP_API_VERSION } from '../../../bridge.mjs';
import { fail } from '../../../../../../vital-connections/helpers.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const maxDuration=30;

export async function GET(request,context){
 try{
  const ctx=await authorizeAgent(request);
  const {phone}=await context.params;
  const route=await assignedContact(ctx,phone);
  const url=new URL(request.url);
  const limit=Math.max(1,Math.min(100,Number.parseInt(url.searchParams.get('limit')||'100',10)||100));
  const after=url.searchParams.get('after');
  if(after&&(!Number.isFinite(Date.parse(after))||after.length>50))throw fail('Data after inválida.',400);
  let query=ctx.db.from('workspace_meta_messages')
    .select('id,meta_message_id,direction,message_type,body,status,sent_at,created_at')
    .eq('connection_id',ctx.connection.id).eq('owner_user_id',ctx.ownerId)
    .eq('contact_wa_id',phone);
  if(after)query=query.gt('sent_at',new Date(after).toISOString()).order('sent_at',{ascending:true});
  else query=query.order('sent_at',{ascending:false});
  const {data,error}=await query.limit(limit);
  if(error)throw fail('Erro ao buscar mensagens da Vital.',503);
  const messages=after?(data||[]):(data||[]).reverse();
  return noCacheJson({workspace:'vital-decor',contact:phone,sector:route.sector,
   assignee:ctx.agent,messages:messages.map(m=>({
    id:m.id,meta_id:m.meta_message_id,direction:m.direction,type:m.message_type,
    body:m.body,status:m.status,sent_at:m.sent_at||m.created_at
   }))});
 }catch(e){return replyError(e);}
}

export async function POST(request,context){
 try{
  const ctx=await authorizeAgent(request);
  const {phone}=await context.params;
  const route=await assignedContact(ctx,phone);
  const body=await request.text();
  if(body.length>10000)throw fail('Mensagem muito longa.',400);
  let payload;
  try{payload=JSON.parse(body);}catch{throw fail('JSON inválido.',400);}
  const text=String(payload?.text||'').trim();
  const idem=String(request.headers.get('idempotency-key')||'').trim();
  if(!text||text.length>4096)throw fail('Mensagem deve ter entre 1 e 4096 caracteres.',400);
  if(!/^[A-Za-z0-9_-]{8,100}$/.test(idem))throw fail('Informe Idempotency-Key único para cada envio.',400);
  if(route.status==='closed')throw fail('Atendimento encerrado.',409);
  const {data:last,error:lastError}=await ctx.db.from('workspace_meta_messages')
    .select('sent_at').eq('connection_id',ctx.connection.id).eq('owner_user_id',ctx.ownerId)
    .eq('contact_wa_id',phone).eq('direction','inbound')
    .order('sent_at',{ascending:false}).limit(1).maybeSingle();
  if(lastError)throw fail('Falha ao verificar janela Meta.',503);
  if(!canReplyWithinWindow(last?.sent_at))
   throw fail('Fora da janela de 24 horas. Utilize um template aprovado para retomar o atendimento.',409);
  const {count,error:rateError}=await ctx.db.from('vital_whatsapp_argo_sends')
    .select('id',{count:'exact',head:true}).eq('connection_id',ctx.connection.id)
    .eq('agent',ctx.agent).gte('created_at',new Date(Date.now()-60000).toISOString());
  if(rateError)throw fail('Falha no limite de segurança.',503);
  if(count>=30)throw fail('Limite de segurança: 30 envios por minuto. Tente novamente.',429);
  // Idempotency: reserve the message BEFORE sending anything to Meta.
  const {data:entry,error:claimError}=await ctx.db.from('vital_whatsapp_argo_sends')
    .insert({connection_id:ctx.connection.id,owner_user_id:ctx.ownerId,
      contact_wa_id:phone,agent:ctx.agent,idempotency_key:idem,status:'processing'})
    .select('id').single();
  if(claimError){
   if(claimError.code!=='23505')throw fail('Falha ao registrar envio.',503);
   const {data:prev}=await ctx.db.from('vital_whatsapp_argo_sends')
    .select('status,meta_message_id,contact_wa_id').eq('connection_id',ctx.connection.id)
    .eq('agent',ctx.agent).eq('idempotency_key',idem).maybeSingle();
   if(prev?.contact_wa_id!==phone)throw fail('Idempotency-Key já utilizado em outro contato.',409);
   if(prev?.status==='accepted')return noCacheJson({ok:true,duplicate:true,message_id:prev.meta_message_id});
   throw fail('Envio em andamento ou resultado incerto. Confira histórico antes de tentar outra mensagem.',409);
  }
  let acceptedId=null;
  try {
   const response=await fetch('https://graph.facebook.com/'+WHATSAPP_API_VERSION+'/'+ctx.connection.external_account_id+'/messages',{
    method:'POST',headers:{Authorization:'Bearer '+ctx.connection.access_token,'Content-Type':'application/json'},
    body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',
      to:phone,type:'text',text:{body:text,preview_url:false}}),
    cache:'no-store',signal:AbortSignal.timeout(20000)
   });
   const json=await response.json().catch(()=>({}));
   if(!response.ok||json.error||!json.messages?.[0]?.id)
    throw fail('Meta não confirmou envio. Código: '+String(json.error?.code||response.status),502);
   acceptedId=String(json.messages[0].id);
  }catch(e){
   await ctx.db.from('vital_whatsapp_argo_sends').update({status:'uncertain',updated_at:new Date().toISOString()}).eq('id',entry.id);
   throw fail('Envio não confirmado. Verifique o histórico no TidePlace antes de reenviar.',502);
  }
  const now=new Date().toISOString();
  const [saved,marked,handoff]=await Promise.all([
   ctx.db.from('workspace_meta_messages').upsert({
    connection_id:ctx.connection.id,owner_user_id:ctx.ownerId,
    meta_message_id:acceptedId,contact_wa_id:phone,direction:'outbound',message_type:'text',
    body:text,status:'sent',sent_at:now,
    raw_payload:{type:'text',source:'argo_bridge',agent:ctx.agent},
   },{onConflict:'connection_id,meta_message_id',ignoreDuplicates:true}),
   ctx.db.from('vital_whatsapp_argo_sends').update({
    status:'accepted',meta_message_id:acceptedId,updated_at:now
   }).eq('id',entry.id),
   ctx.db.from('vital_whatsapp_flow_sessions').upsert({
    connection_id:ctx.connection.id,owner_user_id:ctx.ownerId,contact_wa_id:phone,
    stage:'await_human',human_handoff:true,manual_override:true,
    updated_at:now,last_interaction_at:now,
   },{onConflict:'connection_id,contact_wa_id'}),
  ]);
  const warnings=[];
  if(saved.error)warnings.push('Histórico será conciliado pelo webhook.');
  if(marked.error)warnings.push('Estado de deduplicação pendente.');
  if(handoff.error)warnings.push('Revisar pausa da Vivi.');
  return noCacheJson({ok:true,message_id:acceptedId,sent_at:now,warnings});
 }catch(e){return replyError(e);}
}
