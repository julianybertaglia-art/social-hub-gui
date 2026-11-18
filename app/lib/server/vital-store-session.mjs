import {canReadVitalStore} from './vital-store-access.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const failure=(message,status)=>Object.assign(new Error(message),{status});

// Dedicated, read-only authorization for this store. This is deliberately
// separate from CRM staff access: it cannot grant access to conversations,
// team management, or any other CRM API.
export async function resolveVitalStoreMember({db,token,trustedOrganizationId,guilhermeUserId}={}) {
  if(!UUID.test(trustedOrganizationId||''))
    throw failure('A conexão com a loja ainda não está disponível.',503);
  if(!token)throw failure('Entre no TidePlace para consultar a loja.',401);
  const {data:identity,error:identityError}=await db.auth.getUser(token);
  const userId=identity?.user?.id;
  if(identityError||!userId||identity.user.is_anonymous)
    throw failure('Entre com um login autorizado.',401);

  const [organizationResult,memberResult]=await Promise.all([
    db.from('crm_organizations').select('id,workspace_code,owner_user_id')
      .eq('id',trustedOrganizationId).maybeSingle(),
    db.from('crm_organization_members').select('organization_id,user_id,role,status')
      .eq('organization_id',trustedOrganizationId).eq('user_id',userId).maybeSingle(),
  ]);
  if(organizationResult.error||memberResult.error)
    throw failure('Não foi possível verificar o acesso.',503);
  const organization=organizationResult.data,member=memberResult.data;
  if(!canReadVitalStore({userId,organization,member,guilhermeUserId,trustedOrganizationId}))
    throw failure('Sua conta não tem acesso aos dados da loja.',403);
  return {db,userId,organization,storeOnly:userId!==organization.owner_user_id};
}
