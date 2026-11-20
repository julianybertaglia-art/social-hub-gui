import test from 'node:test';
import assert from 'node:assert/strict';
import {parseManualReport,manualDiagnosis} from '../app/lib/vital-marketing-report.mjs';
import {sanitizeAiReport,createAiMarketingReport} from '../app/lib/server/vital-marketing-ai.mjs';

test('manual values preserve missing fields and accept Brazilian currency formatting',()=>{
 assert.deepEqual(parseManualReport({visits:'100',orders:'0',spend:'1.200,50',revenue:''}).values,
  {visits:100,orders:0,spend:1200.5,revenue:null});
 assert.equal(parseManualReport({spend:'1.200'}).values.spend,1200);
 assert.equal(parseManualReport({spend:'12.50'}).values.spend,12.5);
 assert.ok(parseManualReport({}).error);
 assert.ok(parseManualReport({orders:'1.5'}).error);
 assert.ok(parseManualReport({revenue:'-1'}).error);
});
test('diagnosis does not pretend missing sales are zero or attribute sales to ads',()=>{
 const unknown=manualDiagnosis({visits:1200,orders:null,spend:400,revenue:null});
 assert.match(unknown.summary,/Adicione os pedidos/);
 assert.doesNotMatch(unknown.summary,/nenhum pedido/);
 const noSales=manualDiagnosis({visits:1200,orders:0,spend:400,revenue:0});
 assert.match(noSales.summary,/nenhum pedido pago/);
 assert.match(noSales.summary,/não mostra a causa/);
 assert.ok(noSales.actions.some(action=>action.includes('gasto e os cliques')));
});
test('AI input only contains aggregate allowed fields and rejects unsupported numbers',()=>{
 const safe=sanitizeAiReport({kind:'manual',period:'7',metrics:{visits:20,orders:null,spend:30,revenue:null,
  email:'customer@example.test'},customer_name:'Ana',private_key:'secret'});
 assert.equal(safe.metricas.pedidos_pagos,null);
 assert.doesNotMatch(JSON.stringify(safe),/customer|Ana|secret|@/);
 assert.throws(()=>sanitizeAiReport({kind:'manual',period:'7',metrics:{visits:-2}}));
 assert.throws(()=>sanitizeAiReport({kind:'manual',period:'7',metrics:{orders:1.2}}));
 assert.throws(()=>sanitizeAiReport({kind:'manual',period:'7',metrics:{}}));
});
test('AI keeps platform periods separate and never sends arbitrary source text',()=>{
 const safe=sanitizeAiReport({kind:'connected',ga4:{sessions:33,purchases:2,purchaseRevenue:-1,currency:'BRL',
  customer_name:'Ana'},meta:{spend:20,linkClicks:3,impressions:40,currency:'BRL',range:'2026-10-01/2026-10-30'}});
 assert.equal(safe.GA4.receita_de_compras,-1);
 assert.equal(safe.Meta_Ads.cliques_no_link,3);
 assert.doesNotMatch(JSON.stringify(safe),/Ana/);
 assert.notEqual(safe.GA4.periodo,safe.Meta_Ads.periodo);
});
test('AI request is opt-in, bounded, rejects bad output and omits unapproved fields',async()=>{
 let call;
 const input={kind:'manual',period:'7',metrics:{visits:20,orders:0,spend:null,revenue:null,secret:'hidden'}};
 const output=await createAiMarketingReport(input,{apiKey:'mock-key',fetcher:async(url,options)=>{
  call={url,options};return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({
   resumo:'Houve visitas.',atencao:'Sem pedidos informados.',acoes:['Teste o frete.'],limite:'Faltam origens.'})}]}}]}));
 }});
 assert.equal(output.summary,'Houve visitas.');assert.deepEqual(output.actions,['Teste o frete.']);
 assert.doesNotMatch(call.options.body,/hidden/);assert.equal(call.options.headers['x-goog-api-key'],'mock-key');
 assert.equal(call.options.cache,'no-store');assert.ok(!call.url.includes('mock-key'));
 await assert.rejects(createAiMarketingReport(input,{apiKey:'mock',fetcher:async()=>new Response('{}')}),/invalid_response/);
 await assert.rejects(createAiMarketingReport(input,{apiKey:'mock',fetcher:async()=>new Response('',{status:500})}),/provider_failure/);
});
test('AI retries a temporary provider failure once but never retries bad credentials',async()=>{
 const input={kind:'manual',period:'7',metrics:{visits:20,orders:0,spend:null,revenue:null}};
 let calls=0;
 const result=await createAiMarketingReport(input,{apiKey:'mock',fetcher:async()=>{
  calls++;if(calls===1)return new Response('',{status:503});
  return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({resumo:'OK',acoes:['Verificar.']})}]}}]}));
 }});
 assert.equal(calls,2);assert.equal(result.summary,'OK');
 calls=0;
 await assert.rejects(createAiMarketingReport(input,{apiKey:'mock',fetcher:async()=>{calls++;return new Response('',{status:403});}}),/provider_failure/);
 assert.equal(calls,1);
});
