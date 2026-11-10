import { canAccessVitalQueue,resolveVitalQueue,VITAL_QUEUE_ORDER } from './vital-crm-queues.mjs';
import { fail } from '../api/vital-connections/helpers.mjs';

export const VITAL_PHONE=/^\d{8,15}$/;

// Read only current routing metadata before any caller loads private message
// bodies. The authenticated member's persisted queue grants are authoritative.
export async function resolveAuthorizedVitalContact({db,organization,connection,userId,access,phone}) {
  if(!VITAL_PHONE.test(String(phone||'')))throw fail('Contato inválido.',400);
  const scoped=query=>query.eq('owner_user_id',organization.ownerUserId)
    .eq('connection_id',connection.id).eq('contact_wa_id',phone);
  const [manual,flow,assignment,state]=await Promise.all([
    scoped(db.from('crm_vital_queue_assignments').select('queue_code,updated_at'))
      .eq('organization_id',organization.id).maybeSingle(),
    scoped(db.from('vital_whatsapp_flow_sessions').select('selection,last_interaction_at')).maybeSingle(),
    scoped(db.from('vital_whatsapp_assignments').select('sector,status,assigned_to,updated_at')).maybeSingle(),
    scoped(db.from('crm_vital_conversation_states').select('status,updated_at'))
      .eq('organization_id',organization.id).maybeSingle(),
  ]);
  if([manual,flow,assignment,state].some(result=>result.error))
    throw fail('Não foi possível verificar o acesso à conversa.',503);
  const queue=resolveVitalQueue({override:manual.data?.queue_code,
    selection:flow.data?.selection,sector:assignment.data?.sector});
  let grants=[];
  if(access.role!=='owner'){
    const result=await db.from('crm_vital_member_queues').select('queue_code')
      .eq('organization_id',organization.id).eq('user_id',userId);
    if(result.error)throw fail('Não foi possível verificar seus setores.',503);
    grants=(result.data||[]).map(item=>item.queue_code);
  }
  if(queue&&!VITAL_QUEUE_ORDER.includes(queue))throw fail('Conversa não encontrada.',404);
  if((!queue&&access.role!=='owner')
    ||(queue&&!canAccessVitalQueue(access.role,grants,queue)))
    throw fail('Conversa não encontrada nas filas autorizadas.',404);
  return {queue,manual:manual.data,flow:flow.data,assignment:assignment.data,state:state.data};
}
