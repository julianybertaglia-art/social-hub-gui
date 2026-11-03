import {getVitalCrmMember} from '../../../../lib/vital-crm-access.mjs';
import {resolveVitalQueue,canAccessVitalQueue} from '../../../../lib/vital-crm-queues.mjs';
import {fail} from '../../../vital-connections/helpers.mjs';
import {WHATSAPP_API_VERSION} from '../../../whatsapp/lib';
import {canReplyWithinWindow} from '../../../vital-whatsapp/conversations/inbox.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Authorization'};
export async function POST(request){
 let leaseId=null,leaseDb=null,leaseActor=null,leaseOrg=null,leaseConnection=null,leasePhone=null;
 try{  if(process.env.VITAL_CRM_REPLY_ENABLED!=='true')throw fail('Respostas do CRM não foram liberadas nesta instalação.',403);

  const origin=request.headers.get('origin'),url=new URL(request.url),host=request.headers.get('host');
  if(!origin||(origin!==url.origin&&origin!==url.protocol+'//'+host))throw fail('Origem inválida.',403);
  const {db,userId,access,organization}=await getVitalCrmMember(request);
  leaseDb=db;leaseActor=userId;leaseOrg=organization.id;
  if(!['owner','agent'].includes(access.role))throw fail('Seu perfil tem acesso somente de leitura.',403);
  if(access.role==='agent'&&process.env.VITAL_CRM_STAFF_REPLY_ENABLED!=='true')
    throw fail('Respostas da equipe aguardando liberação final.',403);
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
  if((!queue&&access.role!=='owner')||(queue&&!canAccessVitalQueue(access.role,(grants.data||[]).map(x=>x.queue_code),queue)))
    throw fail('Você não pode responder a uma conversa de outro setor.',403);
  if(legacy.data?.status!=='closed'&&legacy.data?.assigned_to&&legacy.data.assigned_to!=='tide')
    throw fail('Esta conversa ainda está atribuída ao Argo. Transfira o atendimento antes de responder pelo TidePlace.',409);
  if(!canReplyWithinWindow(lastInbound.data?.sent_at))
    throw fail('A janela de 24 horas terminou. É necessário um modelo aprovado pela Meta.',409);

  // Claim a short server-side lease so another attendant cannot send to the
  // same contact while this Meta request is still in flight.
  const claim=await db.rpc('crm_vital_claim_reply_atomic',{
    p_org:organization.id,p_conn:connection.id,p_owner:organization.ownerUserId,
    p_phone:to,p_queue:queue,p_actor:userId,
  });
  if(claim.error){
    if(claim.error.code==='55P03')throw fail('Outro atendente está respondendo a esta conversa. Aguarde e atualize o histórico.',409);
    if(claim.error.code==='42501')throw fail('Sua permissão para esta conversa foi alterada. Atualize o CRM.',403);
    throw fail('Não foi possível reservar este atendimento para resposta.',503);
  }
  leaseId=claim.data;leaseConnection=connection.id;leasePhone=to;
  if(!leaseId)throw fail('Outro atendente está respondendo a esta conversa. Aguarde e atualize o histórico.',409);

  // Recheck routing and Argo ownership after acquiring the lease. The Meta
  // send remains disabled if the source assignment changed during the claim.
  const [verifyManual,verifyFlow,verifyArgo,verifyGrants]=await Promise.all([
    db.from('crm_vital_queue_assignments').select('queue_code')
      .eq('organization_id',organization.id).eq('connection_id',connection.id).eq('contact_wa_id',to).maybeSingle(),
    db.from('vital_whatsapp_flow_sessions').select('selection')
      .eq('owner_user_id',organization.ownerUserId).eq('connection_id',connection.id).eq('contact_wa_id',to).maybeSingle(),
    db.from('vital_whatsapp_assignments').select('sector,assigned_to,status')
      .eq('owner_user_id',organization.ownerUserId).eq('connection_id',connection.id).eq('contact_wa_id',to).maybeSingle(),
    db.from('crm_vital_member_queues').select('queue_code')
      .eq('organization_id',organization.id).eq('user_id',userId),
  ]);
  if(verifyManual.error||verifyFlow.error||verifyArgo.error||verifyGrants.error)
    throw fail('Não foi possível reconfirmar o setor antes do envio.',503);
  const confirmedQueue=resolveVitalQueue({override:verifyManual.data?.queue_code,
    selection:verifyFlow.data?.selection,sector:verifyArgo.data?.sector});
  if(confirmedQueue!==queue||(
    access.role==='agent'&&!canAccessVitalQueue(access.role,(verifyGrants.data||[]).map(x=>x.queue_code),confirmedQueue)))
    throw fail('A fila mudou durante a resposta. Atualize a conversa antes de tentar novamente.',409);
  if(verifyArgo.data?.status!=='closed'&&verifyArgo.data?.assigned_to&&verifyArgo.data.assigned_to!=='tide')
    throw fail('A conversa voltou para a atribuição do Argo. Nenhuma mensagem foi enviada.',409);

  // Pause Vivi before sending. If this write fails, no human message is sent.
  const now=new Date().toISOString();
  const handoff=await db.from('vital_whatsapp_flow_sessions').upsert({
    connection_id:connection.id,owner_user_id:organization.ownerUserId,contact_wa_id:to,
    stage:'await_human',human_handoff:true,manual_override:true,
    updated_at:now,last_interaction_at:now,
  },{onConflict:'connection_id,contact_wa_id'});
  if(handoff.error)throw fail('Não foi possível pausar a Vivi com segurança. Nenhuma mensagem foi enviada.',503);

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
  const messageId=String(delivered.messages[0].id);
  const log=await db.from('workspace_meta_messages').upsert({
      connection_id:connection.id,owner_user_id:organization.ownerUserId,
      meta_message_id:messageId,contact_wa_id:to,
      direction:'outbound',message_type:'text',body:message,status:'sent',sent_at:now,
      raw_payload:{type:'text',source:'crm_vital_manual',sent_by_user:userId},
    },{onConflict:'connection_id,meta_message_id',ignoreDuplicates:true});
  return Response.json({ok:true,messageId,logged:!log.error,
    warning:log.error?'Mensagem enviada pela Meta, mas ainda não apareceu no histórico.':null},{headers});
 }catch(e){
  return Response.json({error:e.status?e.message:'Não foi possível enviar sua mensagem.'},
    {status:e.status||503,headers});
 }finally{
  if(leaseId&&leaseDb){
    const release=await leaseDb.rpc('crm_vital_release_reply_atomic',{
      p_org:leaseOrg,p_conn:leaseConnection,p_phone:leasePhone,p_actor:leaseActor,p_lease:leaseId,
    }).catch(()=>null);
    if(release?.error)console.error('[vital-crm] reply lease release failed',release.error.code);
  }
 }
}
