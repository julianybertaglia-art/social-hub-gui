import test from 'node:test';
import assert from 'node:assert/strict';
import {campaignRatios,marketingCsv,marketingPriorities,draftForProduct} from '../app/lib/vital-marketing-strategy.mjs';
import {sanitizeAiReport} from '../app/lib/server/vital-marketing-ai.mjs';

test('priorities distinguish missing tracking from an event difference and never claim an abandonment rate',()=>{
 const insights={ga4:{status:'ready',data:{events:[{event:'view_item',count:100},{event:'add_to_cart',count:20},
  {event:'begin_checkout',count:5},{event:'purchase',count:null}]}},clarity:{status:'ready',data:{friction:[
  {key:'DeadClickCount',label:'Cliques sem resposta',sessions:100,percentage:12}]}},meta:{status:'ready',data:{linkClicks:40}}};
 const store={status:'ready',data:{paidOrders:2,topProducts:[{name:'Grama',quantity:3}]}};
 const priorities=marketingPriorities(insights,store);
 assert.equal(priorities[0].kind,'medicao');assert.ok(priorities.some(x=>x.kind==='jornada'));
 assert.match(priorities.find(x=>x.kind==='jornada').note,/não mede abandono/);
 assert.ok(priorities.some(x=>x.kind==='produto'&&x.title.includes('Grama')));
 assert.ok(priorities.some(x=>x.kind==='experiencia'));
});
test('missing data stays unknown and ad ratios never divide by zero',()=>{
 const priorities=marketingPriorities({ga4:{status:'ready',data:{events:[{event:'view_item',count:100},{event:'add_to_cart',count:null}]}}},null);
 assert.equal(priorities[0].kind,'dados');assert.doesNotMatch(priorities[0].evidence,/zero compras/);
 assert.deepEqual(campaignRatios({spend:100,linkClicks:20,impressions:1000}),{cpc:5,ctr:2});
 assert.deepEqual(campaignRatios({spend:0,linkClicks:0,impressions:0}),{cpc:null,ctr:null});
});
test('CSV contains useful aggregates, distinguishes examples and neutralizes spreadsheet formulas',()=>{
 const insights={meta:{status:'ready',data:{period:'30 dias',spend:12,currency:'BRL',campaigns:[{name:'=CMD()',spend:12,linkClicks:1}]}},
  ga4:{status:'ready',data:{period:'30 dias',sessions:100}}};
 const csv=marketingCsv(insights,null,[{title:'=IMPORT()',evidence:'teste',action:'verificar'}],null);
 assert.match(csv,/Meta Ads/);assert.match(csv,/"'=IMPORT\(\)"/);assert.doesNotMatch(csv,/private@example/);
 const manual=marketingCsv(insights,null,[],null,{kind:'manual',period:'7',example:true,values:{visits:20,orders:0}});
 assert.match(manual,/Exemplo fictício/);assert.doesNotMatch(manual,/Meta Ads/);
});
test('AI receives limited aggregate product and campaign labels, never contact fields',()=>{
 const input={kind:'connected',ga4:{sessions:50,purchases:null,purchaseRevenue:null,currency:'BRL',
  events:[{event:'view_item',count:30}],products:[{name:'Grama 15mm',views:20,cart:2,purchases:0,email:'cliente@example.test'},
   {name:'cliente@example.test',views:1}]},meta:{spend:10,linkClicks:2,impressions:100,currency:'BRL',
   campaigns:[{name:'Campanha Jardim',spend:10,linkClicks:2,impressions:100,phone:'11999999999'}]},
  store:{start:'2026-10-01',end:'2026-10-30',orders:1,revenue:100,topProducts:[{name:'Grama',quantity:1}]}};
 const result=sanitizeAiReport(input),text=JSON.stringify(result);
 assert.match(text,/Grama 15mm/);assert.match(text,/Campanha Jardim/);
 assert.doesNotMatch(text,/cliente@example|11999999999|"phone"|"email"/);
 assert.equal(result.GA4.produtos.length,1);assert.equal(result.GA4.eventos[0].registros,30);
});
test('email draft contains no recipients and requires an explicit user action to open',()=>{
 const draft=draftForProduct('Jardim vertical');assert.match(draft.subject,/Jardim vertical/);
 assert.match(draft.body,/vitaldecor.com.br/);assert.ok(!('to' in draft));
});
