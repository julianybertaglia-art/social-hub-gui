import test from 'node:test';
import assert from 'node:assert/strict';
import {viviQueue,resolveVitalQueue,canAccessVitalQueue,VITAL_QUEUE_ORDER,VITAL_QUEUE_OWNER_LABEL,VITAL_TEAM_QUEUE_PLAN,needsVitalArgoReconciliation,queueStatus,crmConversationStatus,vitalTransferDestinations} from '../app/lib/vital-crm-queues.mjs';
test('nine distinct queues with no accidental cross-postsale routing',()=>{
 assert.equal(VITAL_QUEUE_ORDER.length,9);
 assert.equal(new Set(VITAL_QUEUE_ORDER).size,9);
 assert.equal(resolveVitalQueue({sector:'pos_venda'}),null);
 assert.equal(resolveVitalQueue({selection:'Pós-venda · Mercado Livre',sector:'pos_venda'}),'pos_ml');
 assert.equal(VITAL_QUEUE_OWNER_LABEL.pos_ml,'Andrey');
 assert.equal(resolveVitalQueue({selection:'Pós-venda · Site Vital Decor',sector:'pos_venda'}),'pos_nv');
 assert.equal(resolveVitalQueue({selection:'Pós-venda - Nuvemshop',sector:'pos_venda'}),'pos_nv');
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

test('explicit resolutions persist until the next new message',()=>{
 const state={status:'resolved',updated_at:'2026-10-28T14:00:00Z'};
 assert.equal(crmConversationStatus({state,lastDirection:'outbound',lastMessageAt:'2026-10-28T13:45:00Z'}),'closed');
 assert.equal(crmConversationStatus({state,lastDirection:'inbound',lastMessageAt:'2026-10-28T14:01:00Z'}),'pending');
 assert.equal(crmConversationStatus({state,lastDirection:'outbound',lastMessageAt:'2026-10-28T14:01:00Z'}),'open');
 assert.equal(crmConversationStatus({state:{status:'open'},legacyClosed:true,lastDirection:'inbound'}),'pending');
 assert.equal(crmConversationStatus({legacyClosed:true,lastDirection:'inbound'}),'closed');
});

test('staff can forward to all nine destinations while still reading only granted queues', () => {
 const all=VITAL_QUEUE_ORDER.map(queue_code=>({queue_code,display_name:queue_code}));
 const transfers=vitalTransferDestinations(all);
 assert.equal(transfers.length,9);
 assert.equal(transfers.some(q=>q.queue_code==='pos_ml'),true);
 assert.equal(canAccessVitalQueue('agent',['pos_shopee'],'pos_ml'),false);
 assert.equal(canAccessVitalQueue('agent',['pos_shopee'],'pos_shopee'),true);
 assert.equal(vitalTransferDestinations([{queue_code:'unknown',display_name:'Outra empresa'}]).length,0);
});

test('the planned marketplace owner and queue access agree without changing other sectors',()=>{
 assert.equal(VITAL_QUEUE_OWNER_LABEL.pos_ml,'Andrey');
 assert.equal(VITAL_TEAM_QUEUE_PLAN.Andrey.queues.includes('pos_ml'),true);
 assert.equal(VITAL_TEAM_QUEUE_PLAN.Vitor.queues.includes('pos_ml'),false);
 for(const queue of ['atacado','vtx','bluetti'])
  assert.equal(VITAL_TEAM_QUEUE_PLAN.Vitor.queues.includes(queue),true);
});

test('same-queue reconciliation is offered only for a mismatched enabled bridge',()=>{
 assert.equal(needsVitalArgoReconciliation(false,'pos_ml','tide'),false);
 assert.equal(needsVitalArgoReconciliation(true,'pos_ml','tide'),true);
 assert.equal(needsVitalArgoReconciliation(true,'pos_ml',null),true);
 assert.equal(needsVitalArgoReconciliation(true,'pos_ml','andrey'),false);
 assert.equal(needsVitalArgoReconciliation(true,'pos_nv','andrey'),true);
 assert.equal(needsVitalArgoReconciliation(true,'pos_nv','tide'),false);
 assert.equal(needsVitalArgoReconciliation(true,'pos_nv',null),false);
 assert.equal(needsVitalArgoReconciliation(true,'unknown','andrey'),false);
});
