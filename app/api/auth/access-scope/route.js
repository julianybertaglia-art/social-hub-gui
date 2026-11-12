import {getSupabaseAdmin} from '../../whatsapp/lib';
import {bearerToken,fail} from '../../vital-connections/helpers.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Authorization'};
export async function GET(request){
 try{
  const db=getSupabaseAdmin();
  const {data:identity,error:identityError}=await db.auth.getUser(bearerToken(request));
  const user=identity?.user;
  if(identityError||!user?.id||user.is_anonymous)throw fail('Sessão inválida.',401);
  const {data:members,error:memberError}=await db.from('crm_organization_members')
    .select('organization_id,user_id,display_name,role,status,can_transfer').eq('user_id',user.id);
  if(memberError)throw fail('Não foi possível verificar sua equipe.',503);
  const {data:organizations,error:orgError}=await db.from('crm_organizations')
    .select('id,workspace_code,display_name,owner_user_id')
    .eq('workspace_code','vital-decor').or(`owner_user_id.eq.${user.id},id.in.(${(members||[]).map(item=>item.organization_id).join(',')||'00000000-0000-0000-0000-000000000000'})`);
  if(orgError)throw fail('Não foi possível verificar a organização.',503);
  const organization=(organizations||[]).find(org=>org.owner_user_id===user.id
    ||(members||[]).some(member=>member.organization_id===org.id));
  if(!organization){
   const {data:legacy,error:legacyError}=await db.from('content_items').select('id')
    .eq('user_id',user.id).eq('title','__SOCIAL_HUB_STATE__').limit(1).maybeSingle();
   if(legacyError)throw fail('Não foi possível verificar sua conta TidePlace.',503);
   if(legacy)return Response.json({scope:'legacy_admin',portalEnabled:true,
    workspace:'gui-nonato',displayName:user.email||'TidePlace',role:'owner'},{headers});
   throw fail('Sua conta não possui acesso autorizado ao TidePlace.',403);
  }
  const membership=(members||[]).find(item=>item.organization_id===organization.id);
  if(!membership||membership.status!=='active')throw fail('Sua conta está suspensa ou não autorizada.',403);
  if(membership.role==='owner'){
   if(organization.owner_user_id!==user.id)throw fail('Conta proprietária inválida.',403);
   return Response.json({scope:'admin',portalEnabled:true,workspace:'vital-decor',
     displayName:membership.display_name||'Juliany',role:'owner'},{headers});
  }
  if(!['agent','supervisor'].includes(membership.role))
   throw fail('Seu perfil não tem acesso à central de atendimento.',403);
  const {data:grants,error:grantError}=await db.from('crm_vital_member_queues')
    .select('queue_code').eq('organization_id',organization.id).eq('user_id',user.id);
  if(grantError)throw fail('Não foi possível validar suas filas.',503);
  if(process.env.VITAL_CRM_STAFF_ENABLED!=='true'){
   return Response.json({scope:'staff_pending',portalEnabled:false,workspace:'vital-decor',
     displayName:membership.display_name||user.email||'Equipe Vital',role:membership.role},{headers});
  }
  if(!grants?.length)throw fail('Sua conta não possui filas autorizadas.',403);
  return Response.json({scope:'staff',portalEnabled:true,workspace:'vital-decor',
    displayName:membership.display_name||user.email||'Equipe Vital',role:membership.role,
    canTransfer:membership.role==='agent'&&membership.can_transfer===true,
    queueCodes:grants.map(item=>item.queue_code)},{headers});
 }catch(error){return Response.json({error:error.status?error.message:'Não foi possível validar seu acesso.'},
  {status:error.status||503,headers});}
}
