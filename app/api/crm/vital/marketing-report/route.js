import {getSupabaseAdmin} from '../../../whatsapp/lib';
import {bearerToken} from '../../../vital-connections/helpers.mjs';
import {resolveVitalStoreMember} from '../../../../lib/server/vital-store-session.mjs';
import {createAiMarketingReport} from '../../../../lib/server/vital-marketing-ai.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const headers={'Cache-Control':'private, no-store',Vary:'Authorization, Cookie'};
const reply=(body,status=200)=>Response.json(body,{status,headers});

export async function POST(request){
 try{
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin)return reply({error:'Origem inválida.'},403);
  await resolveVitalStoreMember({db:getSupabaseAdmin(),token:bearerToken(request),
   trustedOrganizationId:process.env.VITAL_STORE_ORGANIZATION_ID,
   guilhermeUserId:process.env.VITAL_STORE_GUILHERME_USER_ID});
  const raw=await request.text();
  if(raw.length>5000)return reply({error:'Dados do relatório muito extensos.'},400);
  let input;try{input=JSON.parse(raw);}catch{return reply({error:'Dados do relatório inválidos.'},400);}
  const report=await createAiMarketingReport(input,{apiKey:process.env.GEMINI_API_KEY,
   model:process.env.CONTENT_AI_MODEL||'gemini-3.6-flash'});
  return reply({report});
 }catch(error){
  if(error?.status===401||error?.status===403)return reply({error:error.message},error.status);
  if(error?.message==='invalid_report')return reply({error:'Confira os números informados e tente novamente.'},400);
  if(error?.message==='not_configured')return reply({error:'A análise com IA ainda não está configurada.'},409);
  return reply({error:'Não foi possível gerar a análise com IA agora. O resumo automático continua disponível.'},503);
 }
}
