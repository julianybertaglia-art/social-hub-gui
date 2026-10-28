import { getVitalCrmMember } from '../../../lib/vital-crm-access.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Authorization'};
export async function GET(request){
  try{
    const {organization,access}=await getVitalCrmMember(request);
    return Response.json({
      workspace:organization.workspaceCode, name:organization.displayName,
      role:access.role, sectors:access.sectors,
      // This endpoint does not return CRM records, messages, credentials, or staff.
      // Real staff access to them remains disabled until all data APIs are gated.
      portalEnabled:false,
    },{headers});
  }catch(error){
    return Response.json({error:error.status ? error.message : 'Não foi possível verificar seu acesso.'},{status:error.status||503,headers});
  }
}
