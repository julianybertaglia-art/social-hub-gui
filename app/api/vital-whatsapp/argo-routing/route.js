import { authorize } from '../../vital-connections/service';
import { fail } from '../../vital-connections/helpers.mjs';
import { vitalConnection,SECTORS,ASSIGNEES,requireSameOrigin,replyError,noCacheJson } from '../../integrations/argo/v1/bridge.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request){
 try{
  const {db,ownerId}=await authorize(request);
  const conn=await vitalConnection(db,ownerId);
  const [defaults,assignments]=await Promise.all([
   db.from('vital_whatsapp_sector_settings').select('sector,default_assignee,routing_enabled')
    .eq('owner_user_id',ownerId).eq('connection_id',conn.id),
   db.from('vital_whatsapp_assignments').select('contact_wa_id,sector,assigned_to,status,updated_at')
    .eq('owner_user_id',ownerId).eq('connection_id',conn.id)
    .order('updated_at',{ascending:false}).limit(500)
  ]);
  if(defaults.error||assignments.error)throw fail('Não foi possível consultar os setores.',503);
  return noCacheJson({workspace:'vital-decor',
   defaults:SECTORS.map(sector=>({sector,
    assignee:defaults.data?.find(r=>r.sector===sector)?.default_assignee||'tide',
    enabled:defaults.data?.find(r=>r.sector===sector)?.routing_enabled||false})),
   assignments:assignments.data||[]});
 }catch(e){return replyError(e);}
}
export async function POST(request){
 try{
  requireSameOrigin(request);
  const {db,ownerId}=await authorize(request);
  const conn=await vitalConnection(db,ownerId);
  const payload=await request.json();
  const sector=String(payload?.sector||'');
  const assignee=String(payload?.assignee||'');
  if(!SECTORS.includes(sector)||!ASSIGNEES.includes(assignee))throw fail('Setor ou responsável inválido.',400);
  const now=new Date().toISOString();
  if(payload.action==='activate'){
    const {data:rule,error:ruleError}=await db.from('vital_whatsapp_sector_settings')
      .select('default_assignee').eq('connection_id',conn.id).eq('sector',sector).maybeSingle();
    if(ruleError||!rule)throw fail('Primeiro escolha o responsável pelo setor.',409);
    if(payload.enabled){
      if(!['andrey','vitor'].includes(rule.default_assignee))
        throw fail('Para ativar o Argo, selecione Andrey ou Vitor.',409);
      const {count,error:keyError}=await db.from('vital_whatsapp_argo_keys')
        .select('id',{head:true,count:'exact'}).eq('connection_id',conn.id)
        .eq('owner_user_id',ownerId).eq('agent',rule.default_assignee)
        .is('revoked_at',null).gt('expires_at',now);
      if(keyError)throw fail('Não foi possível validar a conexão Argo.',503);
      if(!count)throw fail('O Argo ainda não tem credencial ativa para este responsável.',409);
    }
    const {error}=await db.from('vital_whatsapp_sector_settings').update({
      routing_enabled:payload.enabled===true,updated_at:now,
    }).eq('connection_id',conn.id).eq('sector',sector);
    if(error)throw fail('Falha ao ativar encaminhamento.',503);
    return noCacheJson({ok:true,sector,enabled:payload.enabled===true});
  }
  if(payload.action==='default'){
   const {error}=await db.from('vital_whatsapp_sector_settings').upsert({
    connection_id:conn.id,owner_user_id:ownerId,sector,default_assignee:assignee,routing_enabled:false,updated_at:now,
   },{onConflict:'connection_id,sector'});
   if(error)throw fail('Falha ao salvar distribuição.',503);
   return noCacheJson({ok:true,sector,assignee});
  }
  if(payload.action==='assign'){
   const phone=String(payload.phone||'');
   if(!/^\d{8,15}$/.test(phone))throw fail('Contato inválido.',400);
   const {data:exists,error:e}=await db.from('workspace_meta_messages').select('id')
    .eq('connection_id',conn.id).eq('owner_user_id',ownerId).eq('contact_wa_id',phone)
    .limit(1).maybeSingle();
   if(e)throw fail('Falha ao confirmar conversa.',503);
   if(!exists)throw fail('Contato não encontrado na Vital.',404);
   if(assignee!=='tide'){
     const {data:rule,error:ruleError}=await db.from('vital_whatsapp_sector_settings')
       .select('default_assignee,routing_enabled').eq('connection_id',conn.id)
       .eq('sector',sector).maybeSingle();
     if(ruleError||!rule?.routing_enabled||rule.default_assignee!==assignee)
       throw fail('Configure e ative o atendimento deste setor no Argo antes de transferir.',409);
   }
   const {error}=await db.from('vital_whatsapp_assignments').upsert({
    connection_id:conn.id,owner_user_id:ownerId,contact_wa_id:phone,
    sector,assigned_to:assignee,status:'open',updated_at:now,assigned_at:now,
   },{onConflict:'connection_id,contact_wa_id'});
   if(error)throw fail('Falha ao atribuir a conversa.',503);
   return noCacheJson({ok:true,phone,sector,assignee});
  }
  throw fail('Ação inválida.',400);
 }catch(e){return replyError(e);}
}