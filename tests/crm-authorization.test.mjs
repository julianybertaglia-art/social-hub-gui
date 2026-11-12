import test from 'node:test';
import assert from 'node:assert/strict';
import {canCrmAccess,crmMemberAccess} from '../app/lib/crm-authorization.mjs';
import {canAccessVitalQueue,VITAL_QUEUE_ORDER,VITAL_TEAM_QUEUE_PLAN} from '../app/lib/vital-crm-queues.mjs';

test('unknown, inactive and missing profiles are rejected by default',()=>{
 assert.equal(crmMemberAccess({role:'unknown'}),null);
 assert.equal(crmMemberAccess({role:'agent',status:'suspended',sectors:['pos_shopee']}),null);
 assert.equal(canCrmAccess(undefined,'read_conversation','pos_shopee'),false);
});

test('the four requested profiles have only their explicit ten-queue grants',()=>{
 assert.deepEqual(VITAL_QUEUE_ORDER,[
  'varejo_nv','pos_nv','afiliados','pos_shopee','pos_tiktok','atacado','vtx','bluetti','pos_ml','pos_amazon',
 ]);
 assert.deepEqual(VITAL_TEAM_QUEUE_PLAN.Andrey.queues,['pos_shopee','pos_tiktok','pos_ml','pos_amazon']);
 assert.deepEqual(VITAL_TEAM_QUEUE_PLAN.Vitor.queues,['atacado','vtx','bluetti']);
 assert.equal(VITAL_TEAM_QUEUE_PLAN.Juliany.queues.length,10);
 assert.equal(VITAL_TEAM_QUEUE_PLAN.Guilherme.queues.length,10);
 for(const [name,plan] of Object.entries(VITAL_TEAM_QUEUE_PLAN)){
  const grant=plan.queues;
  for(const queue of VITAL_QUEUE_ORDER){
   assert.equal(canAccessVitalQueue(plan.access,grant,queue),grant.includes(queue),`${name} / ${queue}`);
  }
 }
});

test('an attendant cannot change a requested queue or transfer without an explicit grant',()=>{
 const andrey={role:'agent',status:'active',sectors:VITAL_TEAM_QUEUE_PLAN.Andrey.queues};
 assert.equal(canCrmAccess(andrey,'read_conversation','pos_shopee'),true);
 assert.equal(canCrmAccess(andrey,'reply_conversation','pos_tiktok'),true);
 assert.equal(canCrmAccess(andrey,'read_conversation','pos_ml'),true);
 assert.equal(canCrmAccess(andrey,'read_conversation','pos_amazon'),true);
 assert.equal(canCrmAccess(andrey,'read_conversation','pos_nv'),false);
 assert.equal(canCrmAccess(andrey,'assign_conversation','pos_shopee'),false);
 assert.equal(canCrmAccess({...andrey,canTransfer:true},'assign_conversation','pos_shopee'),true);
});

test('supervisor can view all granted queues but cannot reply, transfer or administer',()=>{
 const supervisor={role:'supervisor',status:'active',sectors:VITAL_TEAM_QUEUE_PLAN.Guilherme.queues};
 for(const queue of VITAL_QUEUE_ORDER){
  assert.equal(canCrmAccess(supervisor,'read_conversation',queue),true);
  assert.equal(canAccessVitalQueue('supervisor',supervisor.sectors,queue),true);
  assert.equal(canCrmAccess(supervisor,'reply_conversation',queue),false);
  assert.equal(canCrmAccess(supervisor,'assign_conversation',queue),false);
 }
});

test('administrator reads all queues even if a browser omits or forges its grant list',()=>{
 const admin={role:'owner',status:'active',sectors:[]};
 for(const queue of VITAL_QUEUE_ORDER){
  assert.equal(canAccessVitalQueue('owner',[],queue),true);
  assert.equal(canCrmAccess(admin,'read_conversation',queue),true);
  assert.equal(canCrmAccess(admin,'assign_conversation',queue),true);
 }
});

test('future installer role cannot read CRM chats or appointments before a scoped policy exists',()=>{
 const installer={role:'installer',sectors:['instalacoes']};
 assert.equal(canCrmAccess(installer,'read_conversation','pos_shopee'),false);
 assert.equal(canCrmAccess(installer,'view_appointments','instalacoes'),false);
});
