import {getSupabaseAdmin} from '../../../whatsapp/lib';
import {bearerToken} from '../../../vital-connections/helpers.mjs';
import {resolveVitalStoreMember} from '../../../../lib/server/vital-store-session.mjs';
import {createNuvemshopReader,validateNuvemshopQuery} from '../../../../lib/server/nuvemshop-read.mjs';
import {projectNuvemshop} from '../../../../lib/server/nuvemshop-project.mjs';
import {claimVitalStoreRequest,pauseVitalStoreRequests} from '../../../../lib/server/vital-store-rate-limit.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Authorization, Cookie'};
const reply=(body,status=200)=>Response.json(body,{status,headers});
const DIAGNOSTIC_CODES=new Set(['config','network','authorization','rate_limit','account','upstream','response','limiter_unavailable']);
// The integration is explicitly scoped to the verified Vital Decor store.
const VITAL_STORE_ID='7938728';

export async function GET(request) {
  try {
    const {db,organization,storeOnly}=await resolveVitalStoreMember({db:getSupabaseAdmin(),token:bearerToken(request),
      trustedOrganizationId:process.env.VITAL_STORE_ORGANIZATION_ID,
      guilhermeUserId:process.env.VITAL_STORE_GUILHERME_USER_ID});
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
      return reply({available:true,storeOnly});
    }
    const page=Number(url.searchParams.get('page')||'1');
    const perPage=Number(url.searchParams.get('perPage')||'25');
    validateNuvemshopQuery(resource,{page,perPage});
    const reader=createNuvemshopReader({storeId:process.env.NUVEMSHOP_VITAL_STORE_ID,
      accessToken:process.env.NUVEMSHOP_VITAL_ACCESS_TOKEN,userAgent:process.env.NUVEMSHOP_VITAL_USER_AGENT});
    await claimVitalStoreRequest(db,organization.id);
    let rows;
    try { rows=await reader.list(resource,{page,perPage}); }
    catch(error) {
      if(error?.code==='rate_limit') {
        const paused=await pauseVitalStoreRequests(db,organization.id);
        if(!paused)console.warn('vital_store_upstream_backoff_unavailable');
      }
      throw error;
    }
    return reply({resource,page,items:projectNuvemshop(resource,rows)});
  } catch(error) {
    // Only fixed error codes are logged; provider bodies, contact information,
    // authorization headers and exception messages never enter these logs.
    if(DIAGNOSTIC_CODES.has(error?.code))console.info('vital_store_read',error.code);
    if(error?.status===401||error?.status===403)
      return reply({error:error.message},error.status);
    if(error?.code==='resource'||error?.code==='pagination')
      return reply({error:'Consulta inválida.'},400);
    if(error?.code==='rate_limit')
      return reply({error:'Aguarde um instante antes de atualizar novamente.'},429);
    return reply({error:'Não foi possível consultar a loja agora.'},503);
  }
}
