import test from 'node:test';
import assert from 'node:assert/strict';
import {samePhone,isSiteLinkNoReturn,classifyLead,recommendationForLead,orderUpdateDraft} from '../app/lib/vital-lead-intelligence.mjs';
import {readVitalLeadProfile} from '../app/lib/server/vital-lead-profile.mjs';

test('Vivi link without reply is identifiable only for retail and verified automation',()=>{
 const msg={direction:'outbound',body:'Veja https://vitaldecor.com.br',raw_payload:{source:'vivi_automation'}};
 assert.equal(isSiteLinkNoReturn(msg,'varejo_nv'),true);
 assert.equal(isSiteLinkNoReturn(msg,null),true);
 assert.equal(isSiteLinkNoReturn(msg,'pos_nv'),false);
 assert.equal(isSiteLinkNoReturn({...msg,direction:'inbound'},'varejo_nv'),false);
 assert.equal(isSiteLinkNoReturn({...msg,raw_payload:{}},'varejo_nv'),false);
 assert.equal(isSiteLinkNoReturn({...msg,body:'https://outro.com'},'varejo_nv'),false);
});
test('phone joins use exact normalized numbers, not a fuzzy suffix',()=>{
 assert.equal(samePhone('11999998888','+55 11 99999-8888'),true);
 assert.equal(samePhone('+55 11 99999-8888','+55 11 99999-8889'),false);
 assert.equal(samePhone('99998888','+55 11 99999-8888'),false);
 assert.equal(samePhone(undefined,'+55 11 99999-8888'),false);
});
test('paid order takes priority over old abandoned checkout',()=>{
 const lead=classifyLead({orders:[{paymentStatus:'paid',status:'open'}],checkouts:[{id:'old'}],siteLinkNoReturn:true,sourcesReady:true});
 assert.equal(lead.id,'cliente');
 const recommendation=recommendationForLead({orders:[{paymentStatus:'paid'}],checkouts:[{id:'old'}],siteLinkNoReturn:true});
 assert.equal(recommendation.kind,'service');
});
test('order messages never claim shipment before matching order status',()=>{
 assert.match(orderUpdateDraft({number:'120',paymentStatus:'paid',shippingStatus:'unpacked'}),/pagamento.*confirmado/);
 assert.doesNotMatch(orderUpdateDraft({number:'120',paymentStatus:'paid',shippingStatus:'unpacked'}),/enviado/i);
 assert.match(orderUpdateDraft({number:'120',paymentStatus:'paid',shippingStatus:'shipped',trackingCode:'ABC123'}),/ABC123/);
 assert.equal(orderUpdateDraft({number:'121',paymentStatus:'pending',shippingStatus:'unpacked'}),null);
});
test('store lookup is read-only, matches exact phone and does not export unrelated records',async()=>{
 const requests=[];
 const fetcher=async (url,options)=>{
  requests.push({url,options});
  assert.equal(options.method,'GET');
  const orders=url.includes('/orders');
  return {ok:true,json:async()=>orders?[
   {id:22,number:120,contact_phone:'(11) 99999-8888',payment_status:'paid',shipping_status:'shipped',total:'149.90',products:[{name:'Jardim',quantity:2}]},
   {id:23,number:121,contact_phone:'(11) 99999-7777',payment_status:'paid',total:'599.90'},
  ]:[{id:31,contact_phone:'5511999998888',total:'100.00',products:[{name:'Grama',quantity:1}]}]};
 };
 const result=await readVitalLeadProfile({phone:'5511999998888',env:{
  NUVEMSHOP_VITAL_STORE_ID:'123456',NUVEMSHOP_VITAL_ACCESS_TOKEN:'secret-test'},
  fetcher,now:new Date('2026-11-20T14:00:00Z'),siteLinkNoReturn:true});
 assert.equal(result.state,'ready');
 assert.equal(result.orders.length,1);assert.equal(result.orders[0].number,'120');
 assert.equal(result.checkouts.length,1);assert.equal(result.lead.id,'cliente');
 assert.equal(requests.length,2);
 assert.ok(requests.every(x=>x.url.startsWith('https://api.nuvemshop.com.br/2025-03/')));
});
test('source failure is reported as partial, never interpreted as zero purchase',async()=>{
 const fetcher=async url=>url.includes('/orders')?{ok:false,status:403}:{ok:true,json:async()=>[]};
 const result=await readVitalLeadProfile({phone:'5511999998888',env:{
  NUVEMSHOP_VITAL_STORE_ID:'123456',NUVEMSHOP_VITAL_ACCESS_TOKEN:'secret-test'},fetcher});
 assert.equal(result.state,'partial');
 assert.equal(result.source.orders.state,'unavailable');
 assert.notEqual(result.lead.label,'Não comprou');
});
test('tracking in an outbound conversation suggests a phone-less order without confirming or leaking it',async()=>{
 const order={id:119,number:119,contact_phone:null,customer:{phone:null},shipping_tracking_number:'TXAQ643789001tx',
  created_at:'2026-11-18T12:00:00Z',total:'1000.00',products:[{name:'Grama',quantity:1}]};
 const env={NUVEMSHOP_VITAL_STORE_ID:'123456',NUVEMSHOP_VITAL_ACCESS_TOKEN:'secret-test'};
 const fetcher=async url=>({ok:true,json:async()=>url.includes('/orders')?[order]:[]});
 const args={phone:'5511940218012',env,fetcher,messages:[{direction:'outbound',body:'Seu rastreio: TXAQ643789001tx'}]};
 const result=await readVitalLeadProfile(args);
 assert.equal(result.orders.length,0);
 assert.equal(result.possibleOrders.length,1);
 assert.equal(result.possibleOrders[0].number,'119');
 assert.equal(result.possibleOrders[0].total,undefined);
 assert.equal(result.possibleOrders[0].products,undefined);
 assert.equal(result.lead.id,'possible_order');
 assert.equal((await readVitalLeadProfile({...args,messages:[{direction:'inbound',body:'TXAQ643789001tx'}]})).possibleOrders.length,0);
 assert.equal((await readVitalLeadProfile({...args,messages:[{direction:'outbound',body:'XTXAQ643789001tx'}]})).possibleOrders.length,0);
 const conflict=async url=>({ok:true,json:async()=>url.includes('/orders')?[{...order,contact_phone:'11999998888'}]:[]});
 assert.equal((await readVitalLeadProfile({...args,fetcher:conflict})).possibleOrders.length,0);
 const duplicated=async url=>({ok:true,json:async()=>url.includes('/orders')?[order,{...order,id:120}]:[]});
 assert.equal((await readVitalLeadProfile({...args,fetcher:duplicated})).possibleOrders.length,0);
});
test('tracking does not suggest an order if the order scan was incomplete',async()=>{
 const env={NUVEMSHOP_VITAL_STORE_ID:'123456',NUVEMSHOP_VITAL_ACCESS_TOKEN:'secret-test'};
 const records=Array.from({length:200},(_,i)=>({id:i+1,shipping_tracking_number:i===0?'TXAQ643789001tx':null}));
 const fetcher=async url=>({ok:true,json:async()=>url.includes('/orders')?records:[]});
 const result=await readVitalLeadProfile({phone:'5511940218012',env,fetcher,
  messages:[{direction:'outbound',body:'TXAQ643789001tx'}]});
 assert.equal(result.source.orders.state,'incomplete');
 assert.deepEqual(result.possibleOrders,[]);
});
