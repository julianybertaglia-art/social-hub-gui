import {getVitalCrmMember} from '../../../../lib/vital-crm-access.mjs';
import {canAccessVitalQueue,resolveVitalQueue,VITAL_QUEUE_ORDER} from '../../../../lib/vital-crm-queues.mjs';
import {fail} from '../../../vital-connections/helpers.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Authorization'};
const PHONE=/^\d{8,15}$/;

export async function PATCH(request){
 try {  if(process.env.VITAL_CRM_WRITES_ENABLED!=='true')throw fail('Alteração de status em validação; nenhuma conversa foi modificada.',403);

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
   scoped('crm_vital_conversation_states','status,updated_at')
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
  const {data:updated,error:statusError}=await db.rpc('crm_vital_set_status_atomic',{
    p_org:organization.id,p_conn:connection.id,p_owner:organization.ownerUserId,
    p_phone:phone,p_source_queue:queue,p_new_status:input.status,p_actor:userId,
    p_expected_updated_at:state.data?.updated_at||null,
  });
  if(statusError||updated!==input.status){
    if(statusError?.code==='40001')throw fail('Esta conversa mudou de situação. Atualize antes de tentar novamente.',409);
    if(statusError?.code==='42501')throw fail('Sua permissão para esta fila mudou. Atualize o CRM.',403);
    throw fail('A situação não foi atualizada. Tente novamente.',503);
  }
  return Response.json({ok:true,status:updated,auditRecorded:true},{headers});
 }catch(e){
  return Response.json({error:e.status?e.message:'Não foi possível atualizar o atendimento.'},
    {status:e.status||503,headers});
 }
}
