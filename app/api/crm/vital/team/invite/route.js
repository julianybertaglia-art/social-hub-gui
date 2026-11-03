import {getVitalCrmMember} from '../../../../../lib/vital-crm-access.mjs';
import {fail} from '../../../../vital-connections/helpers.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Authorization'};
const MAIL=/^[a-z0-9.!#$%&'*+/=?^`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const INVITE_REDIRECT='https://social-hub-gui.vercel.app/equipe';

export function canSendTeamInvitations(env=process.env){
 return env.VITAL_CRM_INVITES_ENABLED==='true'
  &&env.VITAL_CRM_STAFF_ENABLED==='true'
  &&(env.VERCEL_ENV==='production'||
     (env.CI==='true'&&env.NODE_ENV==='development'));
}

async function findExistingAuthUser(db,email){
 for(let page=1;page<=10;page++){
  const {data,error}=await db.auth.admin.listUsers({page,perPage:100});
  if(error)throw fail('Não foi possível verificar contas existentes.',503);
  const users=data?.users||[];
  const existing=users.find(user=>String(user.email||'').toLowerCase()===email);
  if(existing)return existing;
  if(users.length<100)break;
 }
 return null;
}

export async function POST(request){
 try{
  const target=new URL(request.url),origin=request.headers.get('origin');
  if(!origin||origin!==target.origin)throw fail('Origem inválida.',403);
  if(!canSendTeamInvitations())throw fail('Convites da equipe ainda não foram liberados.',403);
  const {db,organization,access,userId}=await getVitalCrmMember(request);
  if(access.role!=='owner'||userId!==organization.ownerUserId)
   throw fail('Somente a administração pode enviar convites.',403);
  const raw=await request.text();
  if(raw.length>750)throw fail('Solicitação muito longa.',400);
  let input;
  try{input=JSON.parse(raw);}catch{throw fail('Dados de convite inválidos.',400);}
  const email=String(input?.email||'').trim().toLowerCase();
  if(email.length>254||!MAIL.test(email))throw fail('E-mail inválido.',400);

  const {data:draft,error:draftError}=await db.from('crm_vital_invite_drafts')
    .select('email,display_name,requested_role,status,activated_at').eq('organization_id',organization.id)
    .eq('email',email).eq('status','draft').maybeSingle();
  if(draftError)throw fail('Não foi possível conferir o convite.',503);
  if(!draft)throw fail('E-mail não autorizado nos rascunhos da Vital.',404);
  if(draft.activated_at)throw fail('Este acesso já foi liberado. Não reenvie o convite.',409);
  const {data:queues,error:queueError}=await db.from('crm_vital_invite_draft_queues')
    .select('queue_code').eq('organization_id',organization.id).eq('email',email);
  if(queueError)throw fail('Não foi possível conferir os setores.',503);
  if(!queues?.length)throw fail('Defina pelo menos um setor antes do convite.',400);

  let user=await findExistingAuthUser(db,email);
  let invitationSent=false;
  if(user?.banned_until&&new Date(user.banned_until).getTime()>Date.now())
   throw fail('Esta conta está suspensa. Revise antes de liberar.',403);
  if(!user){
   const {data,error}=await db.auth.admin.inviteUserByEmail(email,{
    redirectTo:INVITE_REDIRECT,
    data:{display_name:draft.display_name,requires_password_setup:true},
   });
   if(error||!data?.user?.id)
    throw fail('Não foi possível entregar convite pelo Supabase Auth. Confira o SMTP e URLs autorizadas.',503);
   user=data.user;
   invitationSent=true;
  }
  if(String(user?.email||'').toLowerCase()!==email)throw fail('A conta autenticada não corresponde ao convite.',403);
  const {data:provisioned,error:provisionError}=await db.rpc(
   'crm_vital_activate_draft_member_atomic',{
    p_org:organization.id,p_user:user.id,p_email:email,
   });
  if(provisionError||provisioned!==true)
   throw fail('Conta localizada, mas não foi possível ativar os setores. Verifique antes de reenviar.',503);

  return Response.json({ok:true,email,displayName:draft.display_name,
   role:draft.requested_role,
   invitationSent,existingAccount:!invitationSent,
   destination:INVITE_REDIRECT,assignedQueues:queues.map(q=>q.queue_code)},
   {headers});
 }catch(error){
  return Response.json({error:error.status?error.message:'Não foi possível preparar o acesso da equipe.'},
   {status:error.status||503,headers});
 }
}
