import {getVitalCrmMember} from '../../../../lib/vital-crm-access.mjs';
import {fail} from '../../../vital-connections/helpers.mjs';
import {resolveVitalQueue} from '../../../../lib/vital-crm-queues.mjs';
import {canReplyWithinWindow} from '../../../vital-whatsapp/conversations/inbox.mjs';
import {isSiteLinkNoReturn} from '../../../../lib/vital-lead-intelligence.mjs';
import {readVitalLeadProfile} from '../../../../lib/server/vital-lead-profile.mjs';
import {aiInput,analyzeVitalLead} from '../../../../lib/server/vital-lead-ai.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Authorization'};
const result=(body,status=200)=>Response.json(body,{status,headers});
export async function POST(request){
 try{
  const origin=request.headers.get('origin');
  if(!origin||origin!==new URL(request.url).origin)throw fail('Origem inválida.',403);
  const length=Number(request.headers.get('content-length')||0);
  if(length>2000)throw fail('Requisição muito grande.',400);
  const {db,organization,access}=await getVitalCrmMember(request);
  if(access.role!=='owner')throw fail('A análise de clientes está disponível apenas para a administradora.',403);
  const body=await request.text();
  if(body.length>2000)throw fail('Requisição muito grande.',400);
  const contact=String(JSON.parse(body||'{}')?.contact||'');
  if(!/^\d{8,15}$/.test(contact))throw fail('Contato inválido.',400);
  if(!process.env.GEMINI_API_KEY)return result({status:'not_configured'});
  const {data:connection,error:connError}=await db.from('workspace_meta_connections')
   .select('id').eq('owner_user_id',organization.ownerUserId).eq('workspace_id','vital-decor')
   .eq('platform','whatsapp').eq('state','connected').maybeSingle();
  if(connError||!connection)throw fail('WhatsApp Vital não conectado.',409);
  const q=query=>query.eq('owner_user_id',organization.ownerUserId)
    .eq('connection_id',connection.id).eq('contact_wa_id',contact);
  const [messages,flow,manual,assignment]=await Promise.all([
   q(db.from('workspace_meta_messages').select('direction,body,message_type,raw_payload,sent_at,created_at'))
     .order('sent_at',{ascending:false}).limit(80),
   q(db.from('vital_whatsapp_flow_sessions').select('selection')).maybeSingle(),
   q(db.from('crm_vital_queue_assignments').select('queue_code')).eq('organization_id',organization.id).maybeSingle(),
   q(db.from('vital_whatsapp_assignments').select('sector')).maybeSingle()
  ]);
  if(messages.error||flow.error||manual.error||assignment.error)throw fail('Falha ao verificar a conversa.',503);
  if(!messages.data?.length)throw fail('Contato não encontrado.',404);
  const queue=resolveVitalQueue({override:manual.data?.queue_code,selection:flow.data?.selection,sector:assignment.data?.sector});
  const inbound=messages.data.find(x=>x.direction==='inbound');
  const replyWindowOpen=canReplyWithinWindow(inbound?.sent_at||inbound?.created_at);
  const profile=await readVitalLeadProfile({phone:contact,
   siteLinkNoReturn:isSiteLinkNoReturn(messages.data[0],queue),replyWindowOpen});
  const input=aiInput({history:messages.data,profile,queue,replyWindowOpen});
  return result(await analyzeVitalLead({input,profile,apiKey:process.env.GEMINI_API_KEY}));
 }catch(error){
  if(error?.status)return result({error:error.message},error.status);
  const code=error?.message;
  if(code==='ai_unavailable'||code==='invalid_ai')return result({error:'A análise de IA não respondeu corretamente. Seus dados e mensagens foram preservados.'},503);
  return result({error:'Não foi possível analisar a conversa.'},503);
 }
}
