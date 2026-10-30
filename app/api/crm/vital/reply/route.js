import {getVitalCrmMember} from '../../../../lib/vital-crm-access.mjs';
import {resolveVitalQueue,canAccessVitalQueue} from '../../../../lib/vital-crm-queues.mjs';
import {fail} from '../../../vital-connections/helpers.mjs';
import {WHATSAPP_API_VERSION} from '../../../whatsapp/lib';
import {canReplyWithinWindow} from '../../../vital-whatsapp/conversations/inbox.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Authorization'};
export async function POST(request){
 try{
  const origin=request.headers.get('origin'),url=new URL(request.url),host=request.headers.get('host');
  if(!origin||(origin!==url.origin&&origin!==url.protocol+'//'+host))throw fail('Origem inválida.',403);
  const {db,userId,access,organization}=await getVitalCrmMember(request);
  if(!['owner','agent'].includes(access.role))throw fail('Este perfil pode acompanhar e transferir, mas não responder mensagens.',403);
  const textBody=await request.text();
  if(textBody.length>10000)throw fail('Mensagem longa demais.',400);
  const input=JSON.parse(textBody);
  const to=String(input.to||'').trim(),message=String(input.text||'').trim();
  if(!/^\d{8,15}$/.test(to)||!message||message.length>4096)
    throw fail('Escolha um contato e informe uma mensagem de até 4096 caracteres.',400);
  const {data:connection,error:connError}=await db.from('workspace_meta_connections')
    .select('id,external_account_id,access_token')
    .eq('owner_user_id',organization.ownerUserId).eq('workspace_id','vital-decor')
    .eq('platform','whatsapp').eq('state','connected').maybeSingle();
  if(connError||!connection)throw fail('WhatsApp Vital indisponível.',503);
  if(!connection.access_token||!/^\d{5,40}$/.test(String(connection.external_account_id)))
    throw fail('A conexão de envio do WhatsApp Vital está incompleta.',409);
  const [manual,flow,legacy,grants,lastInbound]=await Promise.all([
    db.from('crm_vital_queue_assignments').select('queue_code')
      .eq('organization_id',organization.id).eq('connection_id',connection.id).eq('contact_wa_id',to).maybeSingle(),
    db.from('vital_whatsapp_flow_sessions').select('selection')
      .eq('owner_user_id',organization.ownerUserId).eq('connection_id',connection.id).eq('contact_wa_id',to).maybeSingle(),
    db.from('vital_whatsapp_assignments').select('sector,assigned_to,status')
      .eq('owner_user_id',organization.ownerUserId).eq('connection_id',connection.id).eq('contact_wa_id',to).maybeSingle(),
    db.from('crm_vital_member_queues').select('queue_code')
      .eq('organization_id',organization.id).eq('user_id',userId),
    db.from('workspace_meta_messages').select('sent_at')
      .eq('owner_user_id',organization.ownerUserId).eq('connection_id',connection.id)
      .eq('contact_wa_id',to).eq('direction','inbound')
      .order('sent_at',{ascending:false}).limit(1).maybeSingle(),
  ]);
  if(manual.error||flow.error||legacy.error||grants.error||lastInbound.error)
    throw fail('Não foi possível validar a conversa.',503);
  const queue=resolveVitalQueue({
    override:manual.data?.queue_code,selection:flow.data?.selection,sector:legacy.data?.sector,
  });
  if(!queue || !canAccessVitalQueue(access.role,(grants.data||[]).map(x=>x.queue_code),queue))
    throw fail('Você não pode responder a uma conversa de outro setor.',403);
  if(legacy.data?.status!=='closed'&&legacy.data?.assigned_to&&legacy.data.assigned_to!=='tide')
    throw fail('Esta conversa ainda está atribuída ao Argo. Transfira o atendimento antes de responder pelo TidePlace.',409);
  if(!canReplyWithinWindow(lastInbound.data?.sent_at))
    throw fail('A janela de 24 horas terminou. É necessário um modelo aprovado pela Meta.',409);
  const response=await fetch(
    'https://graph.facebook.com/'+WHATSAPP_API_VERSION+'/'+connection.external_account_id+'/messages',{
      method:'POST',
      headers:{Authorization:'Bearer '+connection.access_token,'Content-Type':'application/json'},
      body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to,
        type:'text',text:{preview_url:false,body:message}}),
      signal:AbortSignal.timeout(20000),cache:'no-store',
    });
  const delivered=await response.json().catch(()=>({}));
  if(!response.ok||delivered.error||!delivered.messages?.[0]?.id)
    throw fail('A Meta não confirmou o envio ('+String(delivered.error?.code||response.status)+').',502);
  const messageId=String(delivered.messages[0].id),now=new Date().toISOString();
  const [log,handoff]=await Promise.all([
    db.from('workspace_meta_messages').upsert({
      connection_id:connection.id,owner_user_id:organization.ownerUserId,
      meta_message_id:messageId,contact_wa_id:to,
      direction:'outbound',message_type:'text',body:message,status:'sent',sent_at:now,
      raw_payload:{type:'text',source:'crm_vital_manual',sent_by_user:userId},
    },{onConflict:'connection_id,meta_message_id',ignoreDuplicates:true}),
    db.from('vital_whatsapp_flow_sessions').upsert({
      connection_id:connection.id,owner_user_id:organization.ownerUserId,contact_wa_id:to,
      stage:'await_human',human_handoff:true,manual_override:true,
      updated_at:now,last_interaction_at:now,
    },{onConflict:'connection_id,contact_wa_id'}),
  ]);
  if(handoff.error)console.error('[vital-crm] Vivi handoff error',handoff.error.code);
  return Response.json({ok:true,messageId,logged:!log.error,
    warning:log.error?'Mensagem enviada pela Meta, mas ainda não apareceu no histórico.':null},{headers});
 }catch(e){
  return Response.json({error:e.status?e.message:'Não foi possível enviar sua mensagem.'},
    {status:e.status||503,headers});
 }
}
