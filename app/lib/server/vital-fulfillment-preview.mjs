// Reliable, read-only order notifications. No customer metadata or addresses are exported.
const STATUSES=new Set(['UNPACKED','PENDING','IN_PREPARATION','PACKED','DISPATCHED','DELIVERED','READY_FOR_PICKUP']);
const DELIVERY=new Set(['DISPATCHED','DELIVERED']);
const clean=(x,max=100)=>typeof x==='string'?x.slice(0,max):'';
const safeUrl=x=>{try{const u=new URL(x);return u.protocol==='https:'?u.href:null}catch{return null}};
const paid=order=>order?.payment_status==='paid'&&order?.status!=='cancelled';
const validStatus=x=>STATUSES.has(String(x||'').toUpperCase())?String(x).toUpperCase():'UNKNOWN';

export function summaryFulfillment(raw,index=0){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const status=validStatus(raw.status);
 const type=raw.shipping?.type==='pickup'?'pickup':raw.shipping?.type==='ship'?'ship':'unknown';
 const tracking=raw.tracking_info||{};
 const trackingCode=clean(tracking.code||tracking.tracking_number||raw.shipping?.tracking_number||'',100);
 const trackingUrl=safeUrl(tracking.url||tracking.tracking_url||raw.shipping?.tracking_url);
 return {id:clean(raw.id,36),number:clean(String(raw.number||index+1),36),
  status,type,carrier:clean(raw.shipping?.carrier?.name||'',70),
  trackingCode,trackingUrl};
}
export function buildFulfillmentSummary(order){
 const raw=order?.fulfillments;
 const shipmentArray=Array.isArray(raw)?raw:null;
 // Missing fulfillments can be an API synchronization delay; never assume no shipments.
 if(!shipmentArray||shipmentArray.some(x=>typeof x!=='object'||!x)){
  return {availability:'unavailable',shipments:[],completed:0,total:0,notice:null};
 }
 if(!shipmentArray.length)return {availability:'pending_sync',shipments:[],completed:0,total:0,notice:null};
 const shipments=shipmentArray.slice(0,30).map(summaryFulfillment).filter(Boolean);
 if(!shipments.length||shipmentArray.length>30)return {availability:'unavailable',shipments:[],completed:0,total:0,notice:null};
 const allShip=shipments.every(x=>x.type==='ship');
 const allPickup=shipments.every(x=>x.type==='pickup');
 const allDelivered=shipments.every(x=>x.status==='DELIVERED');
 const shippingSent=shipments.filter(x=>x.type==='ship'&&DELIVERY.has(x.status)).length;
 const allShipped=allShip&&shippingSent===shipments.length;
 const allPrepared=shipments.every(x=>['PACKED','DISPATCHED','DELIVERED','READY_FOR_PICKUP'].includes(x.status));
 const anyPreparing=shipments.some(x=>['IN_PREPARATION','PACKED','DISPATCHED','DELIVERED','READY_FOR_PICKUP'].includes(x.status));
 const allPickupReady=allPickup&&shipments.every(x=>['READY_FOR_PICKUP','DELIVERED'].includes(x.status));
 const good=paid(order);
 let stage=null;
 if(order?.status==='cancelled')stage='cancelled';
 else if(good&&allShip&&allDelivered)stage='delivered';
 else if(good&&allPickupReady)stage='pickup_ready';
 else if(good&&allShipped)stage='shipped';
 else if(good&&shippingSent>0)stage='partially_shipped';
 else if(good&&allPrepared)stage='packed';
 else if(good&&anyPreparing)stage='preparing';
 else if(good)stage='paid';
 const number=String(order?.number||order?.id||'').slice(0,25);
 const prefix='Olá! 💜 Atualização do pedido'+(number?' #'+number:'')+': ';
 const drafts={
  cancelled:'o pedido consta como cancelado no sistema. Se precisar de ajuda, nossa equipe está à disposição.',
  paid:'o pagamento está confirmado. Avisaremos conforme a preparação avançar.',
  preparing:'seus produtos estão sendo preparados. Em caso de dúvidas, estamos por aqui.',
  packed:'a preparação foi concluída, mas ainda não há confirmação de envio.',
  partially_shipped:'uma parte dos volumes foi enviada. Os demais ainda estão em andamento; você pode acompanhar cada remessa com nossa equipe.',
  shipped:'todos os volumes do pedido foram enviados. Caso queira acompanhar o rastreamento, fale com nossa equipe.',
  pickup_ready:'o pedido consta como pronto para retirada. Antes de vir, confirme os dados da retirada com nossa equipe.',
  delivered:'a entrega de todos os volumes consta como concluída na loja. Deu tudo certo com o recebimento?'
 };
 return {availability:'ready',shipments,completed:shippingSent,total:shipments.length,
  stage,notice:stage?{stage,title:({
   cancelled:'Pedido cancelado',paid:'Pagamento confirmado',preparing:'Preparação',
   packed:'Preparado, sem envio confirmado',partially_shipped:'Envio parcial',shipped:'Pedido enviado',
   pickup_ready:'Pronto para retirada',delivered:'Entrega concluída'
  })[stage],draft:prefix+drafts[stage]}:null};
}
export function eventNoticeFromOrder(event,order){
 if(!order||typeof order!=='object')return {eligible:false,reason:'order_unavailable'};
 if(event==='order/cancelled')return order.status==='cancelled'?
  {eligible:true,stage:'cancelled',label:'Pedido cancelado'}:{eligible:false,reason:'status_not_confirmed'};
 if(!paid(order))return {eligible:false,reason:'payment_not_confirmed'};
 if(event==='order/paid')return {eligible:true,stage:'paid',label:'Pagamento confirmado'};
 const summary=buildFulfillmentSummary(order);
 if(summary.availability!=='ready')return {eligible:false,reason:'shipment_unavailable'};
 const stage=summary.stage;
 if(event==='order/in_preparation'&&['preparing','packed','shipped','delivered'].includes(stage))
  return {eligible:true,stage:'preparing',label:'Em preparação'};
 if(event==='order/packed'&&['packed','shipped','delivered'].includes(stage))
  return {eligible:true,stage:'packed',label:'Preparado'};
 if(event==='order/fulfilled'&&['shipped','delivered'].includes(stage))
  return {eligible:true,stage:'shipped',label:'Pedido integralmente enviado'};
 // Partial fulfillment and tracking events need a shipment-specific journal first.
 return {eligible:false,reason:'stage_not_verified'};
}
