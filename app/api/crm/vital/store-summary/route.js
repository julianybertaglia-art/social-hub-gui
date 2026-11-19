import {getSupabaseAdmin} from '../../../whatsapp/lib';
import {bearerToken} from '../../../vital-connections/helpers.mjs';
import {resolveVitalStoreMember} from '../../../../lib/server/vital-store-session.mjs';
import {readVitalStoreSummary} from '../../../../lib/server/vital-store-summary.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Authorization, Cookie'};
const reply=(data,status=200)=>Response.json(data,{status,headers});

export async function GET(request){
  try{
    await resolveVitalStoreMember({db:getSupabaseAdmin(),token:bearerToken(request),
      trustedOrganizationId:process.env.VITAL_STORE_ORGANIZATION_ID,
      guilhermeUserId:process.env.VITAL_STORE_GUILHERME_USER_ID});
    return reply(await readVitalStoreSummary());
  }catch(error){
    if(error?.status===401||error?.status===403)return reply({error:error.message},error.status);
    return reply({error:'Não foi possível consultar o resumo da loja.'},503);
  }
}
