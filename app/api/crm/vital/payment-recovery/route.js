import {getVitalCrmMember} from '../../../../lib/vital-crm-access.mjs';
import {recoveryPlan} from '../../../../lib/server/vital-payment-recovery.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store',Vary:'Authorization'}});
export async function GET(request){
 try{
  const {access}=await getVitalCrmMember(request);
  if(access.role!=='owner')return reply({error:'Acesso restrito.'},403);
  const store=process.env.NUVEMSHOP_VITAL_STORE_ID,token=process.env.NUVEMSHOP_VITAL_ACCESS_TOKEN;
  if(!/^\d{3,20}$/.test(store||'')||!token)return reply({error:'Loja não configurada.'},503);
  const now=Date.now(), rows=[];
  let incomplete=false;
  for(let page=1;page<=5;page++){
   const query=new URLSearchParams({status:'open',payment_status:'pending',per_page:'100',page:String(page),created_at_min:new Date(now-86400000).toISOString()});
   const response=await fetch('https://api.nuvemshop.com.br/2025-03/'+store+'/orders?'+query,{headers:{Authorization:'Bearer '+token,'User-Agent':process.env.NUVEMSHOP_VITAL_USER_AGENT||'TidePlace Vital CRM',Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(14000)});
   if(!response.ok)throw Error('store_unavailable');
   const orders=await response.json();
   if(!Array.isArray(orders))throw Error('invalid_response');
   for(const order of orders){
    const stages=recoveryPlan(order,now);
    if(stages.length)rows.push({orderNumber:String(order.number||'').slice(0,20),stages,emailAvailable:Boolean(order.contact_email||order.customer?.email),phoneAvailable:Boolean(order.contact_phone||order.customer?.phone)});
   }
   if(orders.length<100)break;
   if(page===5)incomplete=true;
  }
  return reply({mode:'preview',incomplete,orders:rows});
 }catch(e){return reply({error:e.status?e.message:'Não foi possível consultar a fila.'},e.status||503)}
}
