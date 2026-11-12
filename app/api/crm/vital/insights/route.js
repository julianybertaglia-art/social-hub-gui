import {getSupabaseAdmin} from '../../../whatsapp/lib';
import {bearerToken} from '../../../vital-connections/helpers.mjs';
import {resolveVitalStoreMember} from '../../../../lib/server/vital-store-session.mjs';
import {readVitalInsights} from '../../../../lib/server/vital-insights.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Authorization, Cookie'};
const reply=(data,status=200)=>Response.json(data,{status,headers});

export async function GET(request){
  try {
    // Reuse the same server-validated owner/Guilherme allowlist as Nuvemshop;
    // these metrics never grant inbox, team or customer-write privileges.
    await resolveVitalStoreMember({db:getSupabaseAdmin(),token:bearerToken(request),
      trustedOrganizationId:process.env.VITAL_STORE_ORGANIZATION_ID,
      guilhermeUserId:process.env.VITAL_STORE_GUILHERME_USER_ID});
    if(process.env.VITAL_INSIGHTS_ENABLED!=='true')
      return reply({error:'Painel de métricas ainda não foi ativado.'},503);
    const insights=await readVitalInsights();
    return reply(insights);
  }catch(error){
    if(error?.status===401||error?.status===403)return reply({error:error.message},error.status);
    return reply({error:'Não foi possível carregar as métricas.'},503);
  }
}
