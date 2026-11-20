import test from 'node:test';
import assert from 'node:assert/strict';
import {summaryFulfillment,buildFulfillmentSummary,eventNoticeFromOrder} from '../app/lib/server/vital-fulfillment-preview.mjs';
import {readNuvemshopOrder,notificationFromVerifiedOrder} from '../app/lib/server/vital-order-preflight.mjs';

const ship=(status,id='a')=>({id,number:id,status,shipping:{type:'ship',carrier:{name:'Transportadora'}},tracking_info:{code:'AB123'}});
const pickup=(status,id='p')=>({id,number:id,status,shipping:{type:'pickup'}});
const order=(fulfillments,payment_status='paid',status='open')=>({id:123,number:120,status,payment_status,fulfillments});
test('missing fulfillments never declare that shipment completed',()=>{
 assert.equal(buildFulfillmentSummary(order(undefined)).availability,'unavailable');
 assert.equal(buildFulfillmentSummary(order([])).availability,'pending_sync');
 assert.equal(eventNoticeFromOrder('order/fulfilled',order([])).eligible,false);
});
test('partial shipments have distinct status and safe draft',()=>{
 const value=buildFulfillmentSummary(order([ship('DISPATCHED'),ship('PACKED','b')]));
 assert.equal(value.stage,'partially_shipped');
 assert.equal(value.completed,1);
 assert.match(value.notice.draft,/uma parte dos volumes foi enviada/);
 assert.equal(eventNoticeFromOrder('order/fulfilled',order([ship('DISPATCHED'),ship('PACKED','b')])).eligible,false);
});
test('all deliveries with approved statuses qualify for full shipping notice',()=>{
 const o=order([ship('DISPATCHED'),ship('DELIVERED','b')]);
 const summary=buildFulfillmentSummary(o);
 assert.equal(summary.stage,'shipped');
 assert.equal(notificationFromVerifiedOrder({event:'order/fulfilled',order:o}).stage,'shipped');
 assert.equal(buildFulfillmentSummary(order([ship('DELIVERED'),ship('DELIVERED','b')])).stage,'delivered');
});
test('pickup is not shipping and distinguishes ready from collected',()=>{
 const ready=buildFulfillmentSummary(order([pickup('READY_FOR_PICKUP')]));
 assert.equal(ready.stage,'pickup_ready');
 assert.doesNotMatch(ready.notice.draft,/enviado/);
 assert.equal(eventNoticeFromOrder('order/fulfilled',order([pickup('READY_FOR_PICKUP')])).eligible,false);
 assert.equal(buildFulfillmentSummary(order([pickup('DELIVERED')])).stage,'pickup_collected');
});
test('never make payment or delivery claims for unpaid or cancelled orders',()=>{
 const unpaid=buildFulfillmentSummary(order([ship('DELIVERED')],'pending'));
 assert.equal(unpaid.notice,null);
 const cancelled=buildFulfillmentSummary(order([ship('DISPATCHED')],'paid','cancelled'));
 assert.equal(cancelled.stage,'cancelled');
 assert.equal(eventNoticeFromOrder('order/paid',order([ship('DISPATCHED')],'paid','cancelled')).eligible,false);
});
test('no leaking unknown shipping fields, addresses, or unsafe tracking URLs',()=>{
 const raw={id:'a',number:'2',status:'PACKED',recipient:{name:'PRIVATE'},destination:{street:'PRIVATE'},shipping:{type:'ship'},tracking_info:{url:'javascript:alert(1)'}};
 const item=summaryFulfillment(raw);
 assert.equal(item.trackingUrl,null);
 assert.equal(JSON.stringify(item).includes('PRIVATE'),false);
});
test('fetch exact authorized order with optional fulfillment aggregation only by GET',async()=>{
 const fetcher=async(url,init)=>{
  assert.equal(init.method,'GET');
  assert.match(url,/\/orders\/123\?aggregates=fulfillment_orders$/);
  return {ok:true,json:async()=>({id:123,fulfillments:[ship('PACKED')]})};
 };
 const result=await readNuvemshopOrder({storeId:'123456',orderId:'123',token:'sample',includeFulfillments:true,fetcher});
 assert.equal(result.fulfillments.length,1);
});
