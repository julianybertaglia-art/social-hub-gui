// Read-only membership resolver. Call this from each new staff-facing
// endpoint before *any* CRM data query. Never trust a client-supplied sector.
import { getSupabaseAdmin } from '../api/whatsapp/lib';
import { bearerToken, fail } from '../api/vital-connections/helpers.mjs';
import { crmMemberAccess } from './crm-authorization.mjs';

export async function getVitalCrmMember(request) {
  const db=getSupabaseAdmin();
  const token=bearerToken(request);
  const {data:identity,error:identityError}=await db.auth.getUser(token);
  const userId=identity?.user?.id;
  if (identityError || !userId || identity.user.is_anonymous) throw fail('Entre com um login autorizado.',401);

  const {data:memberships,error}=await db.from('crm_organization_members')
    .select('organization_id,user_id,role,status')
    .eq('user_id',userId).eq('status','active');
  if(error)throw fail('Não foi possível verificar seu acesso ao CRM.',503);
  if(!memberships?.length)throw fail('Sua conta não foi autorizada para o CRM da Vital.',403);

  const {data:organizations,error:orgError}=await db.from('crm_organizations')
    .select('id,workspace_code,display_name,owner_user_id')
    .eq('workspace_code','vital-decor').in('id',memberships.map(m=>m.organization_id));
  if(orgError)throw fail('Não foi possível verificar a empresa.',503);
  const found=organizations?.find(o=>memberships.some(m=>m.organization_id===o.id));
  if(!found)throw fail('Sua conta não tem acesso à Vital Decor.',403);
  const member=memberships.find(m=>m.organization_id===found.id);
  if(member.role==='owner' && found.owner_user_id!==userId)throw fail('Permissão de proprietário inválida.',403);

  const {data:grants,error:grantError}=await db.from('crm_organization_member_sectors')
    .select('sector_code').eq('organization_id',found.id).eq('user_id',userId);
  if(grantError)throw fail('Não foi possível verificar seus setores.',503);
  const access=crmMemberAccess({role:member.role,status:member.status,sectors:(grants||[]).map(x=>x.sector_code)});
  if(!access)throw fail('Acesso não autorizado.',403);
  return {db,userId,organization:{id:found.id,workspaceCode:found.workspace_code,displayName:found.display_name,ownerUserId:found.owner_user_id},access};
}
