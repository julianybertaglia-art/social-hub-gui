import { authorize } from '../../vital-connections/service';
import { fail } from '../vital-connections/helpers.mjs';
import { vitalConnection,SECTORS,ASSIGNEES,requireSameOrigin,replyError,noCacheJson } from '../../integrations/argo/v1/bridge.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request){
 try{
  const {db,ownerId}=await authorize(request);
  const conn=await vitalConnection(db,ownerId);
  const [defaults,assignments]=await Promise.all([
   db.from('vital_whatsapp_sector_settings').select('sector,default_assignee')
    .eq('owner_user_id',ownerId).eq('connection_id',conn.id),
   db.from('vital_whatsapp_assignments').select('contact_wa_id,sector,assigned_to,status,updated_at')
    .eq('owner_user_id',ownerId).eq('connection_id',conn.id)
    .order('updated_at',{ascending:false}).limit(500)
  ]);
  if(defaults.error||assignments.error)throw fail('Não foi possível consultar os setores.',503);
  return noCacheJson({workspace:'vital-decor',
   defaults:SECTORS.map(sector=>({sector,assignee:defaults.data?.find(r=>r.sector===sector)?.default_assignee||'tide'})),
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
  if(payload.action==='default'){
   const {error}=await db.from('vital_whatsapp_sector_settings').upsert({
    connection_id:conn.id,owner_user_id:ownerId,sector,default_assignee:assignee,updated_at:now,
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