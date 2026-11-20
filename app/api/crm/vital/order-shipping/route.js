import {getVitalCrmMember} from '../../../../lib/vital-crm-access.mjs';
import {fail} from '../../../vital-connections/helpers.mjs';
import {samePhone} from '../../../../lib/vital-lead-intelligence.mjs';
import {readNuvemshopOrder} from '../../../../lib/server/vital-order-preflight.mjs';
import {buildFulfillmentSummary} from '../../../../lib/server/vital-fulfillment-preview.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Authorization'};
const reply=(data,status=200)=>Response.json(data,{headers,status});

export async function GET(request){
 try{
  const {db,access,organization}=await getVitalCrmMember(request);
  if(access.role!=='owner')throw fail('A expedição da loja está liberada somente para a administração.',403);
  const url=new URL(request.url),contact=String(url.searchParams.get('contact')||''),
   orderId=String(url.searchParams.get('order')||'');
  if(!/^\d{8,15}$/.test(contact)||!/^\d{1,20}$/.test(orderId))
   throw fail('Contato ou pedido inválido.',400);
  const storeId=process.env.NUVEMSHOP_VITAL_STORE_ID,token=process.env.NUVEMSHOP_VITAL_ACCESS_TOKEN;
  if(!/^\d{3,20}$/.test(storeId||'')||!token)throw fail('A consulta de pedidos ainda não está configurada.',503);
  const {data:connection,error:connectionError}=await db.from('workspace_meta_connections')
   .select('id').eq('owner_user_id',organization.ownerUserId).eq('workspace_id','vital-decor')
   .eq('platform','whatsapp').eq('state','connected').maybeSingle();
  if(connectionError||!connection)throw fail('WhatsApp Vital indisponível.',409);
  const {data:exists,error}=await db.from('workspace_meta_messages')
   .select('id').eq('owner_user_id',organization.ownerUserId)
   .eq('connection_id',connection.id).eq('contact_wa_id',contact).limit(1).maybeSingle();
  if(error)throw fail('Falha ao verificar o contato.',503);
  if(!exists)throw fail('Contato não localizado no atendimento autorizado.',404);
  const order=await readNuvemshopOrder({storeId,orderId,token,includeFulfillments:true,
   agent:process.env.NUVEMSHOP_VITAL_USER_AGENT||'TidePlace Vital (read-only)'});
  if(!samePhone(order.contact_phone,contact)&&!samePhone(order.customer?.phone,contact))
   throw fail('Pedido não vinculado ao telefone verificado.',404);
  const shipping=buildFulfillmentSummary(order);
  return reply({orderNumber:String(order.number||order.id||'').slice(0,25),
   orderStatus:order.status,paymentStatus:order.payment_status,
   shippingStatus:order.shipping_status||'unknown',shipping});
 }catch(e){return reply({error:e.status?e.message:'Não foi possível confirmar a expedição deste pedido.'},
   e.status||503);}
}
