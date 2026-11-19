import test from 'node:test';
import assert from 'node:assert/strict';
import {readVitalStoreSummary,summarizeStoreOrders} from '../app/lib/server/vital-store-summary.mjs';

test('summarizes only paid non-cancelled orders without exposing buyer details',()=>{
 const input=[
  {created_at:'2026-11-18T13:00:00Z',payment_status:'paid',total:'199.90',products:[
   {product_id:4,name:'Grama sintética',quantity:2}],customer:{email:'private@example.test'}},
  {created_at:'2026-11-17T12:00:00Z',payment_status:'pending',total:'5000.00'},
  {created_at:'2026-11-17T12:00:00Z',payment_status:'paid',status:'cancelled',total:'300.00'},
  {created_at:'2026-11-17T12:00:00Z',payment_status:'paid',total:'200.10',products:[
   {product_id:4,name:'Grama sintética',quantity:1}]},
  {created_at:'2026-10-01T12:00:00Z',payment_status:'paid',total:'111.00'}
 ];
 const result=summarizeStoreOrders(input,{start:'2026-10-20',end:'2026-11-18'});
 assert.equal(result.paidOrders,2);
 assert.equal(result.revenue,400);
 assert.equal(result.averageTicket,200);
 assert.equal(result.topProducts[0].quantity,3);
 assert.ok(!JSON.stringify(result).includes('private@example.test'));
});
test('read-only API sends bearer token, excludes today and returns safe aggregates',async()=>{
 const urls=[];
 const env={NUVEMSHOP_VITAL_STORE_ID:'123456',NUVEMSHOP_VITAL_ACCESS_TOKEN:'private-test-token',
  NUVEMSHOP_VITAL_USER_AGENT:'TidePlace Marketing (test)'};
 const fetcher=async(url,opts)=>{
  urls.push(url);assert.equal(opts.method,'GET');
  assert.equal(opts.headers.Authorization,'Bearer private-test-token');
  return {ok:true,json:async()=>[{created_at:'2026-11-18T11:00:00-03:00',
   payment_status:'paid',total:'50.00'}]};
 };
 const data=await readVitalStoreSummary(env,fetcher,new Date('2026-11-19T10:00:00Z'));
 assert.equal(data.status,'ready');
 assert.equal(data.data.paidOrders,1);
 assert.equal(data.data.revenue,50);
 assert.match(urls[0],/created_at_max=2026-11-18/);
 assert.ok(!JSON.stringify(data).includes('private-test-token'));
});
test('reports missing credentials and incomplete pagination without misleading totals',async()=>{
 const absent=await readVitalStoreSummary({},()=>{throw Error('network should not run')});
 assert.equal(absent.status,'not_configured');
 const env={NUVEMSHOP_VITAL_STORE_ID:'123456',NUVEMSHOP_VITAL_ACCESS_TOKEN:'token'};
 let pages=0;
 const data=await readVitalStoreSummary(env,async()=>{pages++;return {ok:true,json:async()=>Array.from({length:200},()=>({created_at:'2026-11-18',payment_status:'paid',total:'1'}))};},new Date('2026-11-19T10:00:00Z'));
 assert.equal(data.status,'incomplete');
 assert.equal(pages,5);
});
