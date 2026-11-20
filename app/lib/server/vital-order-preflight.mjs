import {createHmac,timingSafeEqual,createHash} from 'node:crypto';

const KNOWN=new Set(['order/paid','order/in_preparation','order/packed','order/fulfilled','order/cancelled','fulfillment_order/tracking_event_created']);
const digits=x=>/^\d{1,20}$/.test(String(x||''));
export function verifyNuvemshopSignature(raw,header,secret){
 if(!secret||!header||!raw)return false;
 const expected=createHmac('sha256',secret).update(raw).digest('hex');
 const provided=String(header).trim();
 if(!/^[a-f0-9]{64}$/i.test(provided))return false;
 return timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(provided,'hex'));
}
export function parseNuvemshopOrderEvent(input,expectedStoreId){
 if(!input||typeof input!=='object'||String(input.store_id)!==String(expectedStoreId)||!digits(expectedStoreId))
  return {valid:false,reason:'store_mismatch'};
 if(!KNOWN.has(input.event))return {valid:false,reason:'event_not_supported'};
 const orderId=String(input.order_id||(input.event.startsWith('order/')?input.id:''));
 if(!digits(orderId))return {valid:false,reason:'invalid_order'};
 return {valid:true,storeId:String(input.store_id),orderId,event:input.event,
  identifier:String(input.event||'')+'|'+String(input.fulfillment_id||'')+'|'+String(input.tracking_event_id||'')};
}
export function notificationFromVerifiedOrder({event,order}={}){
 if(!order||typeof order!=='object')return {eligible:false,reason:'order_unavailable'};
 const paid=order.payment_status==='paid',cancelled=order.status==='cancelled';
 const status=order.shipping_status;
 if(event==='order/paid'&&paid&&!cancelled)return {eligible:true,stage:'paid',label:'Pagamento confirmado'};
 if(event==='order/in_preparation'&&paid&&!cancelled&&status==='in_preparation')
  return {eligible:true,stage:'preparing',label:'Em preparação'};
 if(event==='order/packed'&&paid&&!cancelled&&status==='packed')
  return {eligible:true,stage:'packed',label:'Pedido embalado'};
 // A pickup or digital order must never be described as shipped.
 if(event==='order/fulfilled'&&paid&&!cancelled&&status==='shipped'&&
    (order.shipping_tracking_number||order.shipping_tracking_url))
  return {eligible:true,stage:'shipped',label:'Pedido enviado'};
 if(event==='order/cancelled'&&cancelled)return {eligible:true,stage:'cancelled',label:'Pedido cancelado'};
 return {eligible:false,reason:'status_not_confirmed'};
}
export function notificationIdempotencyKey({storeId,orderId,stage}={}){
 if(!digits(storeId)||!digits(orderId)||!stage)throw Error('invalid_event');
 return createHash('sha256').update(storeId+':'+orderId+':'+stage).digest('hex');
}
export async function readNuvemshopOrder({storeId,orderId,token,fetcher=fetch,agent='TidePlace Vital CRM'}={}){
 if(!digits(storeId)||!digits(orderId)||!token)throw Error('invalid_store');
 const url='https://api.nuvemshop.com.br/2025-03/'+storeId+'/orders/'+orderId;
 const response=await fetcher(url,{method:'GET',cache:'no-store',headers:{
  Authorization:'Bearer '+token,'User-Agent':agent,Accept:'application/json'},signal:AbortSignal.timeout(14000)});
 if(!response.ok)throw Error('store_unavailable');
 const order=await response.json();
 if(String(order?.id)!==String(orderId))throw Error('order_mismatch');
 return order;
}
