import {getVitalCrmMember} from '../../../../lib/vital-crm-access.mjs';
import {canReadVitalStore} from '../../../../lib/server/vital-store-access.mjs';
import {createNuvemshopReader} from '../../../../lib/server/nuvemshop-read.mjs';
import {projectNuvemshop} from '../../../../lib/server/nuvemshop-project.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Authorization, Cookie'};
const reply=(body,status=200)=>Response.json(body,{status,headers});
// The integration is explicitly scoped to the verified Vital Decor store.
const VITAL_STORE_ID='7938728';

export async function GET(request) {
  try {
    const {db,userId,organization}=await getVitalCrmMember(request);
    const {data:member,error}=await db.from('crm_organization_members')
      .select('organization_id,user_id,role,status').eq('organization_id',organization.id)
      .eq('user_id',userId).maybeSingle();
    if(error)return reply({error:'Não foi possível verificar o acesso.'},503);
    if(!canReadVitalStore({userId,member,guilhermeUserId:process.env.VITAL_STORE_GUILHERME_USER_ID,
      organization:{id:organization.id,workspace_code:organization.workspaceCode,
        owner_user_id:organization.ownerUserId}}))
      return reply({error:'Sua conta não tem acesso aos dados da loja.'},403);
    if(process.env.VITAL_STORE_READ_ENABLED!=='true')
      return reply({error:'A conexão com a loja ainda não está disponível.'},503);
    if(process.env.NUVEMSHOP_VITAL_STORE_ID!==VITAL_STORE_ID)
      return reply({error:'A conexão com a loja ainda não está disponível.'},503);
    const url=new URL(request.url);
    const resource=url.searchParams.get('resource')||'';
    // This probe is authenticated and never contacts the store. It only says
    // the integration is configured, not that the upstream is healthy.
    if(resource==='access') {
      if(!process.env.NUVEMSHOP_VITAL_ACCESS_TOKEN||!process.env.NUVEMSHOP_VITAL_USER_AGENT)
        return reply({error:'A conexão com a loja ainda não está disponível.'},503);
      return reply({available:true});
    }
    const page=Number(url.searchParams.get('page')||'1');
    const perPage=Number(url.searchParams.get('perPage')||'25');
    const reader=createNuvemshopReader({storeId:process.env.NUVEMSHOP_VITAL_STORE_ID,
      accessToken:process.env.NUVEMSHOP_VITAL_ACCESS_TOKEN,userAgent:process.env.NUVEMSHOP_VITAL_USER_AGENT});
    const rows=await reader.list(resource,{page,perPage});
    return reply({resource,page,items:projectNuvemshop(resource,rows)});
  } catch(error) {
    if(error?.status===401||error?.status===403)
      return reply({error:error.message},error.status);
    if(error?.code==='resource'||error?.code==='pagination')
      return reply({error:'Consulta inválida.'},400);
    return reply({error:'Não foi possível consultar a loja agora.'},503);
  }
}
