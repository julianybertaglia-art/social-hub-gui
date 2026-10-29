import {getVitalCrmMember} from '../../../../lib/vital-crm-access.mjs';
import {fail} from '../../../vital-connections/helpers.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Authorization'};
const EMAIL=/^[a-z0-9.!#$%&'*+/=?^`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
async function ownerContext(request){
 const auth=await getVitalCrmMember(request);
 if(auth.access.role!=='owner'||auth.userId!==auth.organization.ownerUserId)
  throw fail('Somente Juliany pode administrar as permissões da Vital.',403);
 return auth;
}
export async function GET(request){
 try{
  const {db,organization}=await ownerContext(request);
  const id=organization.id;
  const [drafts,draftQueues,queues,grants,members]=await Promise.all([
   db.from('crm_vital_invite_drafts').select('email,display_name,requested_role,status,updated_at')
    .eq('organization_id',id).order('display_name'),
   db.from('crm_vital_invite_draft_queues').select('email,queue_code').eq('organization_id',id),
   db.from('crm_vital_queues').select('queue_code,display_name,color,sort_order')
    .eq('organization_id',id).order('sort_order'),
   db.from('crm_vital_member_queues').select('user_id,queue_code').eq('organization_id',id),
   db.from('crm_organization_members').select('user_id,role,status')
    .eq('organization_id',id),
  ]);
  if([drafts,draftQueues,queues,grants,members].some(r=>r.error))
   throw fail('Não foi possível consultar a equipe.',503);
  return Response.json({
   workspace:'vital-decor',queues:queues.data||[],
   drafts:(drafts.data||[]).map(d=>({...d,
    plannedQueues:(draftQueues.data||[]).filter(x=>x.email===d.email).map(x=>x.queue_code)})),
   activeTeam:(members.data||[]).filter(x=>x.role!=='owner').map(m=>({
    role:m.role,status:m.status,
    assignedQueues:(grants.data||[]).filter(g=>g.user_id===m.user_id).map(g=>g.queue_code),
    // Do not reveal raw auth identifiers in the browser.
   })),
   invitationsEnabled:false,
  },{headers});
 }catch(e){return Response.json({error:e.status?e.message:'Não foi possível consultar a equipe.'},
    {status:e.status||503,headers});}
}
export async function PATCH(request){
 try{
  const url=new URL(request.url),origin=request.headers.get('origin');
  if(!origin||origin!==url.origin)throw fail('Origem inválida.',403);
  const {db,organization}=await ownerContext(request);
  const raw=await request.text();
  if(raw.length>3000)throw fail('Solicitação muito longa.',400);
  const input=JSON.parse(raw);
  const email=String(input.email||'').trim().toLowerCase();
  const queue=String(input.queue||'');
  if(!EMAIL.test(email)||queue.length>60||typeof input.enabled!=='boolean')
    throw fail('Dados de permissão inválidos.',400);
  const id=organization.id;
  const [draft,destination]=await Promise.all([
   db.from('crm_vital_invite_drafts').select('email,status')
    .eq('organization_id',id).eq('email',email).maybeSingle(),
   db.from('crm_vital_queues').select('queue_code')
    .eq('organization_id',id).eq('queue_code',queue).maybeSingle(),
  ]);
  if(draft.error||destination.error)throw fail('Falha ao verificar a permissão.',503);
  if(!draft.data||draft.data.status!=='draft'||!destination.data)
   throw fail('Convite ou fila não encontrado.',404);
  const table=db.from('crm_vital_invite_draft_queues');
  const write=input.enabled
   ? await table.upsert({organization_id:id,email,queue_code:queue},
       {onConflict:'organization_id,email,queue_code'})
   : await table.delete().eq('organization_id',id).eq('email',email).eq('queue_code',queue);
  if(write.error)throw fail('Falha ao salvar a fila planejada.',503);
  // A draft never becomes an active permission.
  return Response.json({ok:true,email,queue,enabled:input.enabled,invitationSent:false},{headers});
 }catch(e){return Response.json({error:e.status?e.message:'Não foi possível atualizar o rascunho.'},
    {status:e.status||503,headers});}
}
