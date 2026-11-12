import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveVitalCrmMemberAccess} from '../app/lib/vital-crm-member.mjs';
import {VITAL_TEAM_QUEUE_PLAN} from '../app/lib/vital-crm-queues.mjs';

const organization={id:'org-vital',workspace_code:'vital-decor',owner_user_id:'juliany-id'};
const member=(userId,role,status='active',can_transfer=false)=>({user_id:userId,role,status,can_transfer,display_name:userId});
const grants=queues=>queues.map(queue_code=>({queue_code}));

test('administrator profile is tied to the organization owner and can read all queues',()=>{
 const result=resolveVitalCrmMemberAccess({userId:'juliany-id',organization,
  member:member('juliany-id','owner'),queueGrants:[],staffEnabled:false});
 assert.equal(result.access.role,'owner');
 assert.equal(result.member.displayName,'juliany-id');
 assert.equal(result.access.canTransfer,true);
 assert.throws(()=>resolveVitalCrmMemberAccess({userId:'forged-id',organization,
  member:member('forged-id','owner'),staffEnabled:true}),error=>error.status===403);
});

test('Andrey and Vitor need active server-side memberships, enabled release and exact queue grants',()=>{
 const cases=[
  ['Andrey','andrey-id',VITAL_TEAM_QUEUE_PLAN.Andrey.queues],
  ['Vitor','vitor-id',VITAL_TEAM_QUEUE_PLAN.Vitor.queues],
 ];
 for(const [name,userId,queues] of cases){
  const result=resolveVitalCrmMemberAccess({userId,organization,
   member:member(userId,'agent'),queueGrants:grants(queues),staffEnabled:true});
  assert.equal(result.access.role,'agent',name);
  assert.deepEqual(result.access.sectors,queues,name);
  assert.equal(result.access.canTransfer,false,name);
 }
});

test('Guilherme can view only when active and explicitly granted the supervisor queues',()=>{
 const result=resolveVitalCrmMemberAccess({userId:'guilherme-id',organization,
  member:member('guilherme-id','supervisor', 'active', true),
  queueGrants:grants(VITAL_TEAM_QUEUE_PLAN.Guilherme.queues),staffEnabled:true});
 assert.equal(result.access.role,'supervisor');
 assert.equal(result.access.canTransfer,false);
 assert.equal(result.access.sectors.length,10);
});

test('missing identity, inactive membership, missing release, or missing queues deny access',()=>{
 assert.throws(()=>resolveVitalCrmMemberAccess({organization,member:member('agent-id','agent'),staffEnabled:true}),error=>error.status===401);
 assert.throws(()=>resolveVitalCrmMemberAccess({userId:'agent-id',organization,
  member:member('agent-id','agent','suspended'),queueGrants:grants(['pos_shopee']),staffEnabled:true}),error=>error.status===403);
 assert.throws(()=>resolveVitalCrmMemberAccess({userId:'agent-id',organization,
  member:member('agent-id','agent'),queueGrants:grants(['pos_shopee']),staffEnabled:false}),error=>error.status===403);
 assert.throws(()=>resolveVitalCrmMemberAccess({userId:'agent-id',organization,
  member:member('agent-id','agent'),queueGrants:[],staffEnabled:true}),error=>error.status===403);
 assert.throws(()=>resolveVitalCrmMemberAccess({userId:'agent-id',organization,
  member:member('agent-id','unrecognized'),queueGrants:grants(['pos_shopee']),staffEnabled:true}),error=>error.status===403);
});
