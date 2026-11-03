import {getVitalCrmMember} from '../../../../lib/vital-crm-access.mjs';
import {resolveAuthorizedVitalContact} from '../../../../lib/vital-crm-context.mjs';
import {canAccessVitalQueue,canUseVitalMia,resolveVitalQueue,VITAL_QUEUE_ORDER,crmConversationStatus} from '../../../../lib/vital-crm-queues.mjs';
import {generateMiaText,MIA_ACTIONS,redactMiaPii,getLocalMiaTestTransport} from '../../../../lib/vital-mia.mjs';
import {readRows} from '../../../../lib/operations.mjs';
import {fail} from '../../../vital-connections/helpers.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=35;
const headers={'Cache-Control':'private, no-store',Vary:'Authorization'};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHONE=/^\d{8,15}$/;

async function authorizedMember(request){
  const auth=await getVitalCrmMember(request);
  if(!canUseVitalMia(auth.access.role))
    throw fail('Seu perfil não pode usar a MIA.',403);
  return auth;
}
async function connectionFor(auth){
  const {data:connection,error}=await auth.db.from('workspace_meta_connections')
    .select('id').eq('owner_user_id',auth.organization.ownerUserId)
    .eq('workspace_id','vital-decor').eq('platform','whatsapp').eq('state','connected').maybeSingle();
  if(error||!connection)throw fail('WhatsApp Vital indisponível.',503);
  return connection;
}
async function loadContactContext(auth,connection,phone){
  const {db,organization,userId,access}=auth;
  const routing=await resolveAuthorizedVitalContact({db,organization,connection,userId,access,phone});
  // Message and note bodies are queried only after the current queue was
  // resolved and checked against the server-stored membership grants.
  const [messages,notes,queue]=await Promise.all([
    db.from('workspace_meta_messages').select('direction,body,profile_name,message_type,sent_at,created_at')
      .eq('owner_user_id',organization.ownerUserId).eq('connection_id',connection.id)
      .eq('contact_wa_id',phone).order('sent_at',{ascending:false}).limit(12),
    db.from('crm_vital_conversation_notes').select('body,created_at')
      .eq('organization_id',organization.id).eq('connection_id',connection.id)
      .eq('contact_wa_id',phone).order('message_order',{ascending:false}).limit(8),
    routing.queue?db.from('crm_vital_queues').select('display_name')
      .eq('organization_id',organization.id).eq('queue_code',routing.queue).maybeSingle():Promise.resolve({data:null,error:null}),
  ]);
  if(messages.error||notes.error||queue.error)throw fail('Não foi possível carregar o contexto autorizado.',503);
  if(!messages.data?.length)throw fail('Conversa não encontrada nas filas autorizadas.',404);
  const profileNames=[...new Set(messages.data.map(item=>item.profile_name).filter(Boolean))];
  const latest=messages.data[0];
  const lastInbound=messages.data.find(item=>item.direction==='inbound');
  return {redactionNames:profileNames,context:{
    conversation:{
      queue:queue.data?.display_name||null,
      status:crmConversationStatus({state:routing.state,
        legacyClosed:routing.assignment?.status==='closed',lastDirection:latest.direction,
        lastMessageAt:latest.sent_at||latest.created_at}),
      lastInteractionAt:latest.sent_at||latest.created_at||null,
      replyWindowOpen:Boolean(lastInbound&&Date.now()-Date.parse(lastInbound.sent_at||lastInbound.created_at)<24*60*60*1000),
    },
    messages:messages.data.reverse().map(item=>({
      direction:item.direction==='outbound'?'equipe':'cliente',
      type:item.message_type||'text',at:item.sent_at||item.created_at,
      text:redactMiaPii(item.body||'['+(item.message_type||'mensagem')+']',{names:profileNames}).slice(0,900),
    })),
    internalNotes:(notes.data||[]).reverse().map(item=>({
      at:item.created_at,text:redactMiaPii(item.body,{names:profileNames}).slice(0,500),
    })),
  }};
}

async function loadIndicators(auth,connection){
  const {db,organization,userId,access}=auth;
  const scope=query=>query.eq('owner_user_id',organization.ownerUserId).eq('connection_id',connection.id);
  const [grants,queues]=await Promise.all([
    db.from('crm_vital_member_queues').select('queue_code').eq('organization_id',organization.id).eq('user_id',userId),
    db.from('crm_vital_queues').select('queue_code,display_name').eq('organization_id',organization.id).order('sort_order'),
  ]);
  if(grants.error||queues.error)throw fail('Não foi possível validar suas filas para os indicadores.',503);
  const allowed=(access.role==='owner'?(queues.data||[]).map(item=>item.queue_code):(grants.data||[]).map(item=>item.queue_code))
    .filter(code=>VITAL_QUEUE_ORDER.includes(code));
  // Queue grants are resolved before reading conversation metadata. Only
  // minimal routing and direction fields are used to build authorized counts.
  const [recent,flows,assignments,manuals,states]=await Promise.all([
    readRows(()=>scope(db.from('workspace_meta_messages').select('contact_wa_id,direction,sent_at,id')
      .order('sent_at',{ascending:false}).order('id',{ascending:false})),3000),
    readRows(()=>scope(db.from('vital_whatsapp_flow_sessions').select('contact_wa_id,selection,last_interaction_at')
      .order('contact_wa_id')),5000),
    readRows(()=>scope(db.from('vital_whatsapp_assignments').select('contact_wa_id,sector,status,assigned_to,updated_at')
      .order('contact_wa_id')),5000),
    readRows(()=>scope(db.from('crm_vital_queue_assignments').select('contact_wa_id,queue_code,updated_at')
      .eq('organization_id',organization.id).order('contact_wa_id')),5000),
    readRows(()=>scope(db.from('crm_vital_conversation_states').select('contact_wa_id,status,updated_at')
      .eq('organization_id',organization.id).order('contact_wa_id')),5000),
  ]);
  if([recent,flows,assignments,manuals,states].some(result=>result.error))
    throw fail('Não foi possível consultar os indicadores autorizados.',503);
  const latest=new Map(),flowMap=new Map(),assignmentMap=new Map(),manualMap=new Map(),stateMap=new Map();
  for(const row of recent.data||[])if(!latest.has(row.contact_wa_id))latest.set(row.contact_wa_id,row);
  for(const row of flows.data||[])flowMap.set(row.contact_wa_id,row);
  for(const row of assignments.data||[])assignmentMap.set(row.contact_wa_id,row);
  for(const row of manuals.data||[])manualMap.set(row.contact_wa_id,row);
  for(const row of states.data||[])stateMap.set(row.contact_wa_id,row);
  const phones=new Set([...latest.keys(),...flowMap.keys(),...assignmentMap.keys(),...manualMap.keys(),...stateMap.keys()]);
  const counts={total:0,pending:0,open:0,resolved:0,unclassified:0,queues:{}};
  const labels=new Map((queues.data||[]).map(item=>[item.queue_code,item.display_name]));
  for(const code of VITAL_QUEUE_ORDER){if(allowed.includes(code))counts.queues[labels.get(code)||code]=0;}
  for(const phone of phones){
    if(!PHONE.test(phone))continue;
    const queue=resolveVitalQueue({override:manualMap.get(phone)?.queue_code,
      selection:flowMap.get(phone)?.selection,sector:assignmentMap.get(phone)?.sector});
    if(!queue){if(access.role==='owner'){counts.total++;counts.unclassified++;}continue;}
    if(!allowed.includes(queue)||!canAccessVitalQueue(access.role,allowed,queue))continue;
    const message=latest.get(phone),assignment=assignmentMap.get(phone);
    const status=crmConversationStatus({state:stateMap.get(phone),legacyClosed:assignment?.status==='closed',
      lastDirection:message?.direction,lastMessageAt:message?.sent_at});
    counts.total++;counts[status==='closed'?'resolved':status]++;
    const label=labels.get(queue)||queue;counts.queues[label]=(counts.queues[label]||0)+1;
  }
  return {counts,sampled:(recent.data||[]).length>=3000||[flows,assignments,manuals,states].some(result=>result.data?.length>=5000)};
}

async function ownedThread(db,organizationId,userId,workspaceCode,threadId){
  let query=db.from('crm_vital_mia_threads').select('id,title,created_at,updated_at')
    .eq('organization_id',organizationId).eq('user_id',userId).eq('workspace_code',workspaceCode);
  if(threadId)query=query.eq('id',threadId);
  return query.maybeSingle();
}

export async function GET(request){
  try{
    const auth=await authorizedMember(request),{db,organization,userId}=auth;
    const url=new URL(request.url),requested=url.searchParams.get('thread');
    const workspace=String(url.searchParams.get('workspace')||'vital-decor');
    if(!['vital-decor','gui-nonato'].includes(workspace))throw fail('Ambiente da MIA inválido.',400);
    if(auth.access.role!=='owner'&&workspace!=='vital-decor')throw fail('Ambiente não autorizado.',403);
    if(requested&&!UUID.test(requested))throw fail('Conversa da MIA inválida.',400);
    const listQuery=db.from('crm_vital_mia_threads').select('id,title,created_at,updated_at')
        .eq('organization_id',organization.id).eq('user_id',userId).eq('workspace_code',workspace)
        .order('updated_at',{ascending:false}).limit(30);
    const list=await listQuery;
    if(list.error)throw fail('Não foi possível carregar o histórico privado da MIA.',503);
    const active=requested
      ?await ownedThread(db,organization.id,userId,workspace,requested)
      :{data:list.data?.[0]||null,error:null};
    if(active.error)throw fail('Não foi possível carregar o histórico privado da MIA.',503);
    const thread=active.data;
    let messages=[];
    if(thread){
      const result=await db.from('crm_vital_mia_messages').select('id,role,content,created_at')
        .eq('organization_id',organization.id).eq('user_id',userId).eq('thread_id',thread.id)
        .order('message_order',{ascending:false}).limit(60);
      if(result.error)throw fail('Não foi possível carregar a conversa da MIA.',503);
      messages=(result.data||[]).reverse();
    }
    return Response.json({threads:list.data||[],thread,messages,role:auth.access.role,
      workspace},{headers});
  }catch(error){return Response.json({error:error.status?error.message:'Não foi possível carregar a MIA.'},
    {status:error.status||503,headers});}
}

export async function POST(request){
  try{
    const origin=request.headers.get('origin');
    if(!origin||origin!==new URL(request.url).origin)throw fail('Origem inválida.',403);
    const auth=await authorizedMember(request),{db,organization,userId,access}=auth;
    const raw=await request.text();
    if(raw.length>8000)throw fail('A mensagem excede o tamanho permitido.',413);
    const input=JSON.parse(raw);
    const workspace=String(input.workspace||'vital-decor');
    if(!['vital-decor','gui-nonato'].includes(workspace))throw fail('Ambiente da MIA inválido.',400);
    if(access.role!=='owner'&&workspace!=='vital-decor')throw fail('Seu perfil só pode usar a MIA na Vital Decor.',403);
    if(input.mode==='new'){
      const existing=await db.from('crm_vital_mia_threads').select('id',{count:'exact',head:true})
        .eq('organization_id',organization.id).eq('user_id',userId).eq('workspace_code',workspace);
      if(existing.error)throw fail('Não foi possível validar seu histórico privado.',503);
      if((existing.count||0)>=100)throw fail('O histórico atingiu o limite de 100 conversas. Peça à administradora para revisar a retenção.',409);
      const {data:thread,error}=await db.from('crm_vital_mia_threads').insert({
        organization_id:organization.id,user_id:userId,workspace_code:workspace,title:'Nova conversa',
      }).select('id,title,created_at,updated_at').single();
      if(error)throw fail('Não foi possível abrir uma nova conversa da MIA.',503);
      return Response.json({thread,messages:[]},{status:201,headers});
    }
    const message=String(input.message||'').trim();
    const action=String(input.action||'chat');
    const contact=String(input.contact||'').trim();
    if(!message||message.length>1400||!Object.hasOwn(MIA_ACTIONS,action)||!['vital-decor','gui-nonato'].includes(workspace))
      throw fail('Informe uma pergunta válida para a MIA.',400);
    if(contact&&!PHONE.test(contact))throw fail('Contato inválido.',400);
    if(['summarize','suggest_reply','next_action'].includes(action)&&!contact)
      throw fail('Selecione uma conversa autorizada para esta ação.',400);
    const threadId=input.threadId?String(input.threadId):'';
    if(threadId&&!UUID.test(threadId))throw fail('Conversa da MIA inválida.',400);
    let thread=null;
    if(threadId){
      const result=await ownedThread(db,organization.id,userId,workspace,threadId);
      if(result.error)throw fail('Não foi possível verificar o histórico da MIA.',503);
      if(!result.data)throw fail('Conversa da MIA não encontrada.',404);
      thread=result.data;
    }else{
      const existing=await db.from('crm_vital_mia_threads').select('id',{count:'exact',head:true})
        .eq('organization_id',organization.id).eq('user_id',userId).eq('workspace_code',workspace);
      if(existing.error)throw fail('Não foi possível validar seu histórico privado.',503);
      if((existing.count||0)>=100)throw fail('O histórico atingiu o limite de 100 conversas. Peça à administradora para revisar a retenção.',409);
      const result=await db.from('crm_vital_mia_threads').insert({
        organization_id:organization.id,user_id:userId,workspace_code:workspace,title:'Nova conversa',
      }).select('id,title,created_at,updated_at').single();
      if(result.error)throw fail('Não foi possível abrir uma conversa da MIA.',503);
      thread=result.data;
    }
    let context=null,redactionNames=[];
    const asksForIndicators=action==='insights'||/\b(indicadores?|pendências?|atendimentos?|quantas? conversas|situação das filas|resolvidas?)\b/i.test(message);
    // General MIA chat never needs a WhatsApp connection or CRM message access.
    const needsOperationalContext=workspace==='vital-decor'&&(Boolean(contact)||asksForIndicators);
    const connection=needsOperationalContext?await connectionFor(auth):null;
    if(contact){
      if(workspace!=='vital-decor')throw fail('O CRM selecionado não está autorizado para esta conversa.',403);
      const authorized=await loadContactContext(auth,connection,contact);
      context={contact:authorized.context};redactionNames=authorized.redactionNames;
    }else if(asksForIndicators&&workspace==='vital-decor'){
      context={operationalIndicators:await loadIndicators(auth,connection)};
    }
    const history=await db.from('crm_vital_mia_messages').select('role,content')
      .eq('organization_id',organization.id).eq('user_id',userId).eq('thread_id',thread.id)
      .order('created_at',{ascending:false}).limit(8);
    if(history.error)throw fail('Não foi possível consultar o histórico da MIA.',503);
    // Failed contact authorization or missing CRM context does not consume MIA quota.
    const claim=await db.rpc('crm_vital_mia_claim_request_atomic',{
      p_org:organization.id,p_user:userId,p_limit:20,
    });
    if(claim.error)throw fail('Não foi possível validar o limite de uso da MIA.',503);
    if(claim.data!==true)throw fail('Você atingiu o limite de 20 perguntas por hora. Tente novamente mais tarde.',429);

    // Previously saved model outputs can contain personal data; redact them
    // again before forwarding any history to the external AI provider.
    const recent=(history.data||[]).reverse().map(item=>({
      role:item.role==='assistant'?'model':'user',
      parts:[{text:redactMiaPii(item.content,{names:redactionNames}).slice(0,1100)}],
    }));
    const safeMessage=redactMiaPii(message,{names:redactionNames}).slice(0,1400);
    const localStub=getLocalMiaTestTransport();
    const answer=await generateMiaText({key:localStub?.key||process.env.GEMINI_API_KEY,
      model:process.env.CONTENT_AI_MODEL||'gemini-3.6-flash',message:safeMessage,action,
      workspace:workspace==='vital-decor'?'Vital Decor':'Gui Nonato',role:access.role,context,
      history:recent,...(localStub?{fetchImpl:localStub.fetchImpl}:{})});
    // Do not persist or return names/contact details that the model may
    // have repeated from the operational context.
    const safeAnswer=redactMiaPii(answer,{names:redactionNames});
    const save=await db.rpc('crm_vital_mia_save_exchange_atomic',{
      p_org:organization.id,p_thread:thread.id,p_user:userId,
      p_user_content:safeMessage,p_assistant_content:safeAnswer,
      p_title:thread.title==='Nova conversa'?safeMessage.slice(0,80):thread.title,
    });
    if(save.error)throw fail('A MIA respondeu, mas não foi possível salvar o histórico privado.',503);
    return Response.json({answer:safeAnswer,threadId:thread.id,action,role:access.role,
      canInsertReply:action==='suggest_reply'&&Boolean(contact)},{headers});
  }catch(error){return Response.json({error:error.status?error.message:'Não foi possível responder agora.'},
    {status:error.status||503,headers});}
}
