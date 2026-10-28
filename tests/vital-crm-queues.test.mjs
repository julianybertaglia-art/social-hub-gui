import test from 'node:test';
import assert from 'node:assert/strict';
import {viviQueue,resolveVitalQueue,canAccessVitalQueue,VITAL_QUEUE_ORDER,queueStatus} from '../app/lib/vital-crm-queues.mjs';
test('nine distinct queues with no accidental cross-postsale routing',()=>{
 assert.equal(VITAL_QUEUE_ORDER.length,9);
 assert.equal(new Set(VITAL_QUEUE_ORDER).size,9);
 assert.equal(resolveVitalQueue({sector:'pos_venda'}),null);
 assert.equal(resolveVitalQueue({selection:'Pós-venda · Mercado Livre',sector:'pos_venda'}),'pos_ml');
 assert.equal(resolveVitalQueue({selection:'Revenda',sector:'atacado'}),'atacado');
 assert.equal(resolveVitalQueue({selection:'Produtos Vital Decor'}),'varejo_nv');
 assert.equal(viviQueue('qualquer outra coisa'),null);
});
test('manual override beats Vivi selection; a transfer does not silently remap',()=>{
 assert.equal(resolveVitalQueue({override:'pos_shopee',selection:'Revenda'}),'pos_shopee');
 assert.equal(resolveVitalQueue({override:'pos_nv',sector:'pos_venda'}),'pos_nv');
});
test('agents can receive from another queue, but cannot view it before transfer',()=>{
 assert.equal(canAccessVitalQueue('agent',['pos_shopee'],'pos_shopee'),true);
 assert.equal(canAccessVitalQueue('agent',['pos_shopee'],'pos_ml'),false);
 assert.equal(canAccessVitalQueue('supervisor',['pos_shopee'],'pos_ml'),false);
 assert.equal(canAccessVitalQueue('owner',[],'pos_ml'),true);
 assert.equal(canAccessVitalQueue('installer',[],'pos_ml'),false);
 assert.equal(canAccessVitalQueue('agent',[],'pos_venda'),false);
});
test('inbound pending; outbound in progress; explicit closed wins',()=>{
 assert.equal(queueStatus({lastDirection:'inbound'}),'pending');
 assert.equal(queueStatus({lastDirection:'outbound'}),'open');
 assert.equal(queueStatus({closed:true,lastDirection:'inbound'}),'closed');
});
