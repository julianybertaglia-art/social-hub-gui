import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {redactLeadText,safeAiHistory,aiInput,sanitizeLeadAiDecision,analyzeVitalLead} from '../app/lib/server/vital-lead-ai.mjs';
import {verifyNuvemshopSignature,parseNuvemshopOrderEvent,notificationFromVerifiedOrder,notificationIdempotencyKey,readNuvemshopOrder} from '../app/lib/server/vital-order-preflight.mjs';
import {orderTimeline,orderUpdateDraft,recommendationForLead} from '../app/lib/vital-lead-intelligence.mjs';

test('mask common private content before any model call',()=>{
 const text=redactLeadText('Meu telefone +55 (11) 99999-8888, email pessoa@teste.com, CPF 123.456.789-01 e https://site.com/segredo');
 assert.doesNotMatch(text,/99999|pessoa@|123\.456|site\.com/);
 assert.match(text,/\[telefone\].*\[email\]|\[email\].*\[telefone\]/);
 const history=safeAiHistory([
  {direction:'outbound',message_type:'text',body:'resposta interna'},
  {direction:'inbound',message_type:'text',body:'Preciso de frete'},
  {direction:'inbound',message_type:'image',body:'imagem'},
 ]);
 assert.deepEqual(history,['Preciso de frete']);
});
test('model cannot grant sending permissions or manufacture paid status',()=>{
 const data={intencao:'compra',prioridade:'alta',resumo:'Cliente quer informações',evidencia:'Perguntou frete',
  proxima_acao:'Confirmar destino',quando:'agora_se_janela_aberta',precisa_responder:true,rascunho:'Olá, tenho uma oferta'};
 const profile={lead:{label:'Link enviado · sem retorno'},orders:[{paymentStatus:'paid',status:'open'}]};
 assert.equal(sanitizeLeadAiDecision(data,{replyWindowOpen:false,profile}).draft,'');
 assert.equal(sanitizeLeadAiDecision(data,{replyWindowOpen:true,profile}).draft,'');
 assert.equal(sanitizeLeadAiDecision(data,{replyWindowOpen:true,profile:{orders:[],lead:{label:'Contato'}}}).draft,'Olá, tenho uma oferta');
});
test('AI only receives bounded sanitized messages and JSON, no client keys',async()=>{
 let actual;
 const fetcher=async (url,options)=>{actual={url,options};
 return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({
  intencao:'frete',prioridade:'media',resumo:'Quer informações de envio',evidencia:'Perguntou frete',
  proxima_acao:'Pedir CEP',quando:'apos_resposta_do_cliente',precisa_responder:false
 })}]}}]})};};
 const input=aiInput({history:[{direction:'inbound',message_type:'text',body:'Meu email é cliente@exemplo.com. Qual o frete?'}],
 profile:{state:'ready',lead:{id:'contato',label:'Contato'},orders:[],checkouts:[]},replyWindowOpen:true});
 const response=await analyzeVitalLead({input,profile:{lead:{label:'Contato'},orders:[]},apiKey:'fake-secret',fetcher});
 assert.equal(response.analysis.intent,'frete');
 assert.doesNotMatch(actual.options.body,/cliente@exemplo.com/);
 assert.equal(actual.options.method,'POST');
});
test('verify HMAC over raw payload, deny wrong signature and missing secret',()=>{
 const raw='{"store_id":123,"event":"order/paid","id":987}';
 const signature=createHmac('sha256','test-secret').update(raw).digest('hex');
 assert.equal(verifyNuvemshopSignature(raw,signature,'test-secret'),true);
 assert.equal(verifyNuvemshopSignature(raw,'x'+signature.slice(1),'test-secret'),false);
 assert.equal(verifyNuvemshopSignature(raw,signature,''),false);
 assert.equal(verifyNuvemshopSignature(raw,'wrong','test-secret'),false);
});
test('event parsing enforces store and allowed topics',()=>{
 assert.deepEqual(parseNuvemshopOrderEvent({store_id:444,event:'order/paid',id:17},'123').reason,'store_mismatch');
 assert.equal(parseNuvemshopOrderEvent({store_id:123,event:'order/paid',id:987},'123').orderId,'987');
 assert.equal(parseNuvemshopOrderEvent({store_id:123,event:'product/updated',id:987},'123').valid,false);
 assert.equal(parseNuvemshopOrderEvent({store_id:123,event:'fulfillment_order/tracking_event_created',order_id:987},'123').valid,true);
});
test('notify only verified statuses; no false shipping or prepaid notifications',()=>{
 assert.equal(notificationFromVerifiedOrder({event:'order/paid',order:{payment_status:'pending'}}).eligible,false);
 assert.equal(notificationFromVerifiedOrder({event:'order/paid',order:{payment_status:'paid',status:'open'}}).stage,'paid');
 assert.equal(notificationFromVerifiedOrder({event:'order/fulfilled',order:{payment_status:'paid',status:'open',shipping_status:'shipped'}}).eligible,false);
 assert.equal(notificationFromVerifiedOrder({event:'order/fulfilled',order:{payment_status:'paid',status:'open',shipping_status:'shipped',fulfillments:[{id:'a',status:'DISPATCHED',shipping:{type:'ship'},tracking_info:{code:'ABC'}}]}}).stage,'shipped');
 assert.equal(notificationFromVerifiedOrder({event:'order/cancelled',order:{status:'cancelled'}}).stage,'cancelled');
 const keyA=notificationIdempotencyKey({storeId:123,orderId:34,stage:'paid'});
 assert.equal(keyA,notificationIdempotencyKey({storeId:123,orderId:34,stage:'paid'}));
 assert.notEqual(keyA,notificationIdempotencyKey({storeId:123,orderId:34,stage:'shipped'}));
});
test('order preflight uses GET and validates returned order ID',async()=>{
 const fetcher=async(url,options)=>{
  assert.match(url,/\/123\/orders\/987$/);assert.equal(options.method,'GET');
  return {ok:true,json:async()=>({id:987,payment_status:'paid'})};
 };
 assert.equal((await readNuvemshopOrder({storeId:'123',orderId:'987',token:'test',fetcher})).id,987);
});
test('cancelled orders have no payment confirmation draft',()=>{
 assert.equal(orderUpdateDraft({status:'cancelled',paymentStatus:'paid',number:'120'}),null);
 assert.equal(orderUpdateDraft({status:'open',paymentStatus:'refunded',number:'120'}),null);
 assert.deepEqual(orderTimeline({status:'open',paymentStatus:'paid',shippingStatus:'shipped'}).map(x=>x.done),[true,true,true,false]);
 assert.equal(recommendationForLead({orders:[{paymentStatus:'paid',shippingStatus:'delivered',status:'open'}]}).title,'Pós-venda');
});
