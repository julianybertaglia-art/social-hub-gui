import {getVitalCrmMember} from '../../../../lib/vital-crm-access.mjs';
import {fail} from '../../../vital-connections/helpers.mjs';
import {readVitalLeadProfile} from '../../../../lib/server/vital-lead-profile.mjs';
import {isSiteLinkNoReturn} from '../../../../lib/vital-lead-intelligence.mjs';
import {resolveVitalQueue} from '../../../../lib/vital-crm-queues.mjs';
import {canReplyWithinWindow} from '../../../vital-whatsapp/conversations/inbox.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Authorization'};
export async function GET(request){
 try{
  const {db,organization,access}=await getVitalCrmMember(request);
  // The personal purchase timeline is restricted to the real owner for now.
  if(access.role!=='owner')throw fail('A carteira de clientes está liberada apenas para a administradora.',403);
  const contact=new URL(request.url).searchParams.get('contact')||'';
  if(!/^\d{8,15}$/.test(contact))throw fail('Contato inválido.',400);
  const {data:connection,error:connError}=await db.from('workspace_meta_connections')
   .select('id').eq('owner_user_id',organization.ownerUserId).eq('workspace_id','vital-decor')
   .eq('platform','whatsapp').eq('state','connected').maybeSingle();
  if(connError||!connection)throw fail('WhatsApp Vital não conectado.',409);
  const {data:messages,error}=await db.from('workspace_meta_messages')
   .select('contact_wa_id,body,direction,raw_payload,sent_at,created_at')
   .eq('owner_user_id',organization.ownerUserId).eq('connection_id',connection.id)
   .eq('contact_wa_id',contact).order('sent_at',{ascending:false}).limit(150);
  if(error)throw fail('Não foi possível verificar o histórico.',503);
  if(!messages?.length)throw fail('Contato não localizado neste WhatsApp.',404);
  const [flow,manual,assignment]=await Promise.all([
   db.from('vital_whatsapp_flow_sessions').select('selection')
    .eq('owner_user_id',organization.ownerUserId).eq('connection_id',connection.id)
    .eq('contact_wa_id',contact).maybeSingle(),
   db.from('crm_vital_queue_assignments').select('queue_code')
    .eq('owner_user_id',organization.ownerUserId).eq('connection_id',connection.id)
    .eq('organization_id',organization.id).eq('contact_wa_id',contact).maybeSingle(),
   db.from('vital_whatsapp_assignments').select('sector')
    .eq('owner_user_id',organization.ownerUserId).eq('connection_id',connection.id)
    .eq('contact_wa_id',contact).maybeSingle(),
  ]);
  if(flow.error||manual.error||assignment.error)throw fail('Falha ao identificar a fila do atendimento.',503);
  const queue=resolveVitalQueue({override:manual.data?.queue_code,
   selection:flow.data?.selection,sector:assignment.data?.sector});
  const linkNoReturn=isSiteLinkNoReturn(messages[0],queue);
  const lastInbound=messages.find(x=>x.direction==='inbound');
  const profile=await readVitalLeadProfile({phone:contact,siteLinkNoReturn:linkNoReturn,
   replyWindowOpen:canReplyWithinWindow(lastInbound?.sent_at||lastInbound?.created_at)});
  return Response.json(profile,{headers});
 }catch(e){
  return Response.json({error:e.status?e.message:'Não foi possível consultar os dados da loja.'},
   {status:e.status||503,headers});
 }
}
