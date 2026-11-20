import {getVitalCrmMember} from '../../../../lib/vital-crm-access.mjs';
import {fail} from '../../../vital-connections/helpers.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Authorization'};
export async function GET(request){
 try{
  const {access}=await getVitalCrmMember(request);
  if(access.role!=='owner')throw fail('Disponível apenas para a administradora.',403);
  const store=Boolean(process.env.NUVEMSHOP_VITAL_STORE_ID&&process.env.NUVEMSHOP_VITAL_ACCESS_TOKEN);
  const signature=Boolean(process.env.NUVEMSHOP_VITAL_APP_CLIENT_SECRET);
  return Response.json({mode:'preparation',sendingEnabled:false,
   checks:[
    {id:'store',label:'Consulta de pedidos da Nuvemshop',ready:store},
    {id:'signature',label:'Assinatura dos eventos da Nuvemshop',ready:signature},
    {id:'ledger',label:'Controle persistente de mensagens duplicadas',ready:false},
    {id:'meta',label:'Modelos e consentimento validados na Meta',ready:false}
   ],
   explanation:'Os envios automáticos continuam desativados. Você pode conferir as remessas e preparar uma mensagem dentro da carteira.'},
   {headers});
 }catch(e){return Response.json({error:e.status?e.message:'Não foi possível consultar a preparação.'},
   {status:e.status||503,headers});}
}
