import {getVitalCrmMember} from '../../../../lib/vital-crm-access.mjs';
import {canAccessVitalQueue,resolveVitalQueue,VITAL_QUEUE_ORDER} from '../../../../lib/vital-crm-queues.mjs';
import {fail} from '../../../vital-connections/helpers.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Authorization'};
const PHONE=/^\d{8,15}$/;

export async function PATCH(request){
 try {
  const url=new URL(request.url), origin=request.headers.get('origin');
  if(!origin||origin!==url.origin)throw fail('Origem inválida.',403);
  const raw=await request.text();
  if(raw.length>4096)throw fail('Solicitação muito longa.',400);
  const input=JSON.parse(raw);
  const phone=String(input.contact||'').trim();
  if(!PHONE.test(phone)||!['resolved','open'].includes(input.status))
    throw fail('Conversa ou situação inválida.',400);
  const {db,userId,access,organization}=await getVitalCrmMember(request);
  if(!['owner','agent'].includes(access.role))
    throw fail('Seu perfil não pode alterar o status de uma conversa.',403);
  const {data:connection,error:connError}=await db.from('workspace_meta_connections')
    .select('id').eq('owner_user_id',organization.ownerUserId)
    .eq('workspace_id','vital-decor').eq('platform','whatsapp')
    .eq('state','connected').maybeSingle();
  if(connError||!connection)throw fail('WhatsApp Vital não conectado.',409);
  const scoped=(name,columns)=>db.from(name).select(columns)
    .eq('owner_user_id',organization.ownerUserId)
    .eq('connection_id',connection.id).eq('contact_wa_id',phone);
  const [manual,flow,legacy,grants,lastMessage,state]=await Promise.all([
   scoped('crm_vital_queue_assignments','queue_code')
     .eq('organization_id',organization.id).maybeSingle(),
   scoped('vital_whatsapp_flow_sessions','selection').maybeSingle(),
   scoped('vital_whatsapp_assignments','sector').maybeSingle(),
   db.from('crm_vital_member_queues').select('queue_code')
     .eq('organization_id',organization.id).eq('user_id',userId),
   scoped('workspace_meta_messages','id').limit(1).maybeSingle(),
   scoped('crm_vital_conversation_states','status')
     .eq('organization_id',organization.id).maybeSingle(),
  ]);
  if([manual,flow,legacy,grants,lastMessage,state].some(r=>r.error))
    throw fail('Não foi possível confirmar o acesso à conversa.',503);
  if(!lastMessage.data)throw fail('Conversa não encontrada.',404);
  const queue=resolveVitalQueue({override:manual.data?.queue_code,
    selection:flow.data?.selection,sector:legacy.data?.sector});
  if(!queue || !VITAL_QUEUE_ORDER.includes(queue) ||
    !canAccessVitalQueue(access.role,(grants.data||[]).map(q=>q.queue_code),queue))
    throw fail('Esta conversa não pertence às suas filas.',403);
  if(state.data?.status===input.status)
    return Response.json({ok:true,unchanged:true,status:input.status},{headers});
  const now=new Date().toISOString();
  const result=await db.from('crm_vital_conversation_states').upsert({
    organization_id:organization.id,owner_user_id:organization.ownerUserId,
    connection_id:connection.id,contact_wa_id:phone,
    status:input.status,updated_by:userId,updated_at:now,
  },{onConflict:'organization_id,connection_id,contact_wa_id'})
    .select('status').single();
  if(result.error||!result.data)throw fail('Não foi possível atualizar a conversa.',503);
  const audit=await db.from('crm_vital_status_audit').insert({
    organization_id:organization.id,connection_id:connection.id,
    contact_wa_id:phone,old_status:state.data?.status||null,
    new_status:input.status,updated_by:userId,
  });
  if(audit.error)console.error('[vital-crm] Falha ao registrar auditoria de status:',audit.error.code);
  return Response.json({ok:true,status:input.status,auditRecorded:!audit.error},{headers});
 }catch(e){
  return Response.json({error:e.status?e.message:'Não foi possível atualizar o atendimento.'},
    {status:e.status||503,headers});
 }
}
