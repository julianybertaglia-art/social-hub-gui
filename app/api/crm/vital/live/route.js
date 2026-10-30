import { getVitalCrmMember } from '../../../../lib/vital-crm-access.mjs';
import { fail } from '../../../vital-connections/helpers.mjs';
import {readRows} from '../../../../lib/operations.mjs';
import {resolveVitalQueue,canAccessVitalQueue,crmConversationStatus,VITAL_QUEUE_ORDER,vitalTransferDestinations} from '../../../../lib/vital-crm-queues.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Authorization'};
const PHONE=/^\d{8,15}$/;

async function context(request){
  const auth=await getVitalCrmMember(request);
  if(auth.access.role!=='owner')throw fail('Nesta fase o CRM real está liberado apenas para a administradora.',403);
  const {db,organization,access,userId}=auth;
  const owner=organization.ownerUserId;
  const {data:connection,error:connectionError}=await db.from('workspace_meta_connections')
    .select('id,display_name,display_phone_number')
    .eq('owner_user_id',owner).eq('workspace_id','vital-decor')
    .eq('platform','whatsapp').eq('state','connected').maybeSingle();
  if(connectionError)throw fail('Falha ao consultar a integração da Vital.',503);
  if(!connection)throw fail('WhatsApp Vital ainda não conectado.',409);
  const [grants,queues]=await Promise.all([
    db.from('crm_vital_member_queues').select('queue_code')
      .eq('organization_id',organization.id).eq('user_id',userId),
    db.from('crm_vital_queues').select('queue_code,display_name,color,parent_sector,sort_order')
      .eq('organization_id',organization.id).order('sort_order'),
  ]);
  if(grants.error||queues.error)throw fail('Não foi possível consultar as permissões.',503);
  const allowed=access.role==='owner'
    ? (queues.data||[]).map(q=>q.queue_code)
    : (grants.data||[]).map(g=>g.queue_code);
  return {...auth,owner,connection,allowed,queues:queues.data||[]};
}
function allowedQueue(ctx,queue){
  return canAccessVitalQueue(ctx.access.role,ctx.allowed,queue);
}
async function resolveOne(ctx,phone){
  const {db,organization,owner,connection}=ctx;
  const scope=query=>query.eq('owner_user_id',owner).eq('connection_id',connection.id).eq('contact_wa_id',phone);
  const [manual,flow,assignment,state]=await Promise.all([
    scope(db.from('crm_vital_queue_assignments').select('queue_code,updated_at')).eq('organization_id',organization.id).maybeSingle(),
    scope(db.from('vital_whatsapp_flow_sessions').select('selection,last_interaction_at')).maybeSingle(),
    scope(db.from('vital_whatsapp_assignments').select('sector,status,assigned_to,updated_at')).maybeSingle(),
    scope(db.from('crm_vital_conversation_states').select('status,updated_at')).eq('organization_id',organization.id).maybeSingle(),
  ]);
  if(manual.error||flow.error||assignment.error||state.error)throw fail('Não foi possível verificar o setor da conversa.',503);
  const queue=resolveVitalQueue({override:manual.data?.queue_code,selection:flow.data?.selection,sector:assignment.data?.sector});
  return {queue,manual:manual.data,flow:flow.data,assignment:assignment.data,state:state.data};
}
function formatMessage(m){
  return {id:m.id,direction:m.direction,body:m.body||'',type:m.message_type||'text',
    status:m.status||null,at:m.sent_at||m.created_at};
}
async function readOne(ctx,phone){
  if(!PHONE.test(phone))throw fail('Número de contato inválido.',400);
  const info=await resolveOne(ctx,phone);
  if((!info.queue && ctx.access.role!=='owner') || (info.queue && !allowedQueue(ctx,info.queue)))
    throw fail('Conversa não encontrada nas filas autorizadas.',404);
  const {db,owner,connection}=ctx;
  const {data:messages,error}=await db.from('workspace_meta_messages')
    .select('id,profile_name,contact_wa_id,direction,body,message_type,status,sent_at,created_at')
    .eq('owner_user_id',owner).eq('connection_id',connection.id)
    .eq('contact_wa_id',phone).order('sent_at',{ascending:false}).limit(150);
  if(error)throw fail('Falha ao carregar histórico.',503);
  if(!messages?.length)throw fail('Conversa não encontrada.',404);
  return {contact:{id:phone,phone,name:messages.find(m=>m.profile_name)?.profile_name||phone,
      queue:info.queue,status:crmConversationStatus({state:info.state,
        legacyClosed:info.assignment?.status==='closed',lastDirection:messages[0].direction,
        lastMessageAt:messages[0].sent_at||messages[0].created_at})},
    messages:messages.reverse().map(formatMessage),truncated:messages.length===150};
}

async function summary(ctx,page){
  const {db,owner,connection,organization}=ctx;
  const q=fn=>fn.eq('owner_user_id',owner).eq('connection_id',connection.id);
  const [recent,flows,assignments,overrides,states]=await Promise.all([
    readRows(()=>q(db.from('workspace_meta_messages')
      .select('contact_wa_id,direction,sent_at,id')
      .order('sent_at',{ascending:false}).order('id',{ascending:false})),3000),
    readRows(()=>q(db.from('vital_whatsapp_flow_sessions')
      .select('contact_wa_id,selection,last_interaction_at')
      .order('contact_wa_id')),5000),
    readRows(()=>q(db.from('vital_whatsapp_assignments')
      .select('contact_wa_id,sector,status,assigned_to,updated_at')
      .order('contact_wa_id')),5000),
    readRows(()=>q(db.from('crm_vital_queue_assignments')
      .select('contact_wa_id,queue_code,updated_at')
      .eq('organization_id',organization.id).order('contact_wa_id')),5000),
    readRows(()=>q(db.from('crm_vital_conversation_states')
      .select('contact_wa_id,status,updated_at')
      .eq('organization_id',organization.id).order('contact_wa_id')),5000),
  ]);
  if(recent.error||flows.error||assignments.error||overrides.error||states.error)throw fail('Falha ao consultar atendimentos.',503);
  const latest=new Map(),flowMap=new Map(),assignMap=new Map(),overrideMap=new Map(),stateMap=new Map();
  for(const m of recent.data||[])if(!latest.has(m.contact_wa_id))latest.set(m.contact_wa_id,m);
  for(const x of flows.data||[])flowMap.set(x.contact_wa_id,x);
  for(const x of assignments.data||[])assignMap.set(x.contact_wa_id,x);
  for(const x of overrides.data||[])overrideMap.set(x.contact_wa_id,x);
  for(const x of states.data||[])stateMap.set(x.contact_wa_id,x);
  const allPhones=new Set([...latest.keys(),...flowMap.keys(),...assignMap.keys(),...overrideMap.keys(),...stateMap.keys()]);
  const rows=[];
  for(const phone of allPhones){
    if(!PHONE.test(phone))continue;
    const a=assignMap.get(phone),f=flowMap.get(phone),manual=overrideMap.get(phone),last=latest.get(phone);
    const queue=resolveVitalQueue({override:manual?.queue_code,selection:f?.selection,sector:a?.sector});
    // Administrator sees unclassified conversations in a separate bucket.
    if(!queue && ctx.access.role!=='owner')continue;
    if(queue&&!allowedQueue(ctx,queue))continue;
    rows.push({id:phone,phone,queue:queue||null,
      status:crmConversationStatus({state:stateMap.get(phone),legacyClosed:a?.status==='closed',
        lastDirection:last?.direction,lastMessageAt:last?.sent_at}),
      updatedAt:last?.sent_at||manual?.updated_at||f?.last_interaction_at||a?.updated_at||null,
      assignedTo:a?.assigned_to||null});
  }
  rows.sort((a,b)=>Date.parse(b.updatedAt||'')-Date.parse(a.updatedAt||''));
  const counters={total:rows.length,pending:0,open:0,closed:0,unassigned:0,queues:{}};
  for(const qCode of VITAL_QUEUE_ORDER)counters.queues[qCode]=0;
  for(const row of rows){
    counters[row.status]=(counters[row.status]||0)+1;
    if(row.queue)counters.queues[row.queue]=(counters.queues[row.queue]||0)+1;
    else counters.unassigned+=1;
  }
  const sliced=rows.slice(page*30,page*30+30);
  const enriched=await Promise.all(sliced.map(async row=>{
    // Only here, after filtering by the authenticated user's permitted
    // queues, do we read a message body or contact profile name.
    const {data,error}=await q(db.from('workspace_meta_messages')
      .select('body,profile_name,message_type').eq('contact_wa_id',row.phone)
      .order('sent_at',{ascending:false}).limit(1)).maybeSingle();
    if(error)throw fail('Falha ao consultar últimas mensagens.',503);
    return {...row,name:data?.profile_name||row.phone,
      preview:String(data?.body|| (data?.message_type?'['+data.message_type+']':'Sem mensagem')).slice(0,180)};
  }));
  return {
    workspace:'vital-decor', role:ctx.access.role, counters,
    queues:ctx.queues.filter(q=>allowedQueue(ctx,q.queue_code)),
    transferDestinations:vitalTransferDestinations(ctx.queues),
    conversations:enriched,page,hasMore:rows.length>(page+1)*30,
    sampled:(recent.data||[]).length>=3000||(flows.data||[]).length>=5000||(states.data||[]).length>=5000,
    readOnly:process.env.VITAL_CRM_WRITES_ENABLED!=='true',
  };
}
export async function GET(request){
  try{
    const ctx=await context(request),url=new URL(request.url);
    const phone=url.searchParams.get('contact');
    if(phone)return Response.json(await readOne(ctx,phone),{headers});
    const p=Number(url.searchParams.get('page')||0);
    if(!Number.isSafeInteger(p)||p<0||p>100)throw fail('Página inválida.',400);
    return Response.json(await summary(ctx,p),{headers});
  }catch(e){
    return Response.json({error:e.status?e.message:'Não foi possível carregar as conversas.'},
      {status:e.status||503,headers});
  }
}
export async function PATCH(request){
  try{
    if(process.env.VITAL_CRM_WRITES_ENABLED!=='true')throw fail('Movimentação desativada até validar Argo e permissões.',403);
    const origin=request.headers.get('origin');
    if(!origin||origin!==new URL(request.url).origin)throw fail('Origem inválida.',403);
    const ctx=await context(request);
    const body=await request.json().catch(()=>({}));
    const phone=String(body.contact||''),toQueue=String(body.toQueue||'');
    if(!PHONE.test(phone)||!VITAL_QUEUE_ORDER.includes(toQueue))throw fail('Contato ou fila inválidos.',400);
    const validDestination=ctx.queues.some(q=>q.queue_code===toQueue);
    if(!validDestination)throw fail('Fila de destino inexistente.',404);
    const current=await resolveOne(ctx,phone);
    if(current.queue && !allowedQueue(ctx,current.queue))
      throw fail('Você não pode transferir conversas de outro setor.',403);
    if(!current.queue&&ctx.access.role!=='owner')
      throw fail('Somente a administração pode distribuir conversas não classificadas.',403);
    if(current.queue===toQueue)return Response.json({ok:true,unchanged:true,toQueue},{headers});
    // Confirm conversation exists before accepting a manual assignment.
    const {data:exists,error:existsError}=await ctx.db.from('workspace_meta_messages')
      .select('id').eq('owner_user_id',ctx.owner).eq('connection_id',ctx.connection.id)
      .eq('contact_wa_id',phone).limit(1).maybeSingle();
    if(existsError||!exists)throw fail('Conversa não encontrada.',404);
    const {data:result,error:transferError}=await ctx.db.rpc('crm_vital_transfer_atomic',{
      p_org:ctx.organization.id,p_conn:ctx.connection.id,p_owner:ctx.owner,
      p_phone:phone,p_to_queue:toQueue,p_expected_from:current.queue,
      p_expected_override_at:current.manual?.updated_at||null,p_actor:ctx.userId,
    });
    if(transferError||result!==toQueue){
      if(transferError?.code==='40001')throw fail('Esta conversa foi modificada. Atualize a página e tente novamente.',409);
      if(transferError?.code==='42501')throw fail('Seu acesso a esta conversa foi alterado. Atualize a página.',403);
      throw fail('Não foi possível registrar a transferência. Nenhuma alteração foi concluída.',503);
    }
    return Response.json({ok:true,toQueue,fromQueue:current.queue,auditRecorded:true},{headers});
  }catch(e){
    return Response.json({error:e.status?e.message:'Não foi possível transferir o atendimento.'},
      {status:e.status||503,headers});
  }
}
