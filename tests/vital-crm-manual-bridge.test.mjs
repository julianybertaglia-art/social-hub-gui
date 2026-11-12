import test from 'node:test';
import assert from 'node:assert/strict';
import {manualBridgePlan, transferManually} from '../app/lib/vital-crm-manual-bridge.mjs';

const current = {queue:'varejo_nv',manual:null,assignment:{assigned_to:'tide',status:'open',updated_at:'t1'}};
function fakeDb(data, error=null) {
  const calls=[];
  return {calls, async rpc(name,args){calls.push({name,args});return {data,error}}};
}
const args = db => ({db, organizationId:'org', connectionId:'conn', ownerId:'owner',
  phone:'5511999999999', actorId:'actor', current});

test('marketplaces are planned for Andrey, site and other sectors stay in Tide',()=>{
  for (const toQueue of ['pos_shopee','pos_tiktok','pos_ml']) {
    const p=manualBridgePlan({enabled:true,toQueue,currentQueue:'varejo_nv',assignment:current.assignment});
    assert.equal(p.desiredAssignee,'andrey');
    assert.equal(p.usesBridge,true);
  }
  for (const toQueue of ['pos_nv','varejo_nv','atacado','vtx','bluetti','afiliados']) {
    const p=manualBridgePlan({enabled:true,toQueue,currentQueue:'pos_ml',
      assignment:{assigned_to:'andrey',status:'open'}});
    assert.equal(p.desiredAssignee,'tide');
    assert.equal(p.usesBridge,true);
  }
  assert.throws(()=>manualBridgePlan({enabled:true,toQueue:'pos_unknown'}),/inválida/);
});
test('disabled integration keeps the existing RPC and does not transfer to Argo',async()=>{
  const db=fakeDb('pos_ml');
  const plan=manualBridgePlan({enabled:false,toQueue:'pos_ml',currentQueue:'varejo_nv',assignment:current.assignment});
  const result=await transferManually({...args(db),plan,toQueue:'pos_ml'});
  assert.equal(result.confirmed,true);
  assert.equal(db.calls.length,1);
  assert.equal(db.calls[0].name,'crm_vital_transfer_atomic');
  assert.equal('p_assignee' in db.calls[0].args,false);
});
test('disabled bridge never changes only the Tide queue while Argo still owns the conversation',async()=>{
  const db=fakeDb('pos_nv');
  const plan=manualBridgePlan({enabled:false,toQueue:'pos_nv',currentQueue:'pos_ml',
    assignment:{assigned_to:'andrey',status:'open'}});
  assert.equal(plan.blocked,true);
  const result=await transferManually({...args(db),plan,toQueue:'pos_nv'});
  assert.equal(result.confirmed,false);
  assert.equal(result.error.code,'BRIDGE_DISABLED');
  assert.equal(db.calls.length,0);
});
test('bridge routing uses one atomic operation including bridge state and audit confirmation',async()=>{
  const db=fakeDb({to_queue:'pos_ml',assigned_to:'andrey',audit_recorded:true});
  const plan=manualBridgePlan({enabled:true,toQueue:'pos_ml',currentQueue:'varejo_nv',assignment:current.assignment});
  const result=await transferManually({...args(db),plan,toQueue:'pos_ml'});
  assert.equal(result.confirmed,true);
  assert.equal(db.calls.length,1);
  assert.equal(db.calls[0].name,'crm_vital_transfer_argo_atomic');
  assert.equal(db.calls[0].args.p_assignee,'andrey');
  assert.equal(db.calls[0].args.p_expected_bridge_assignee,'tide');
  assert.equal(db.calls[0].args.p_expected_bridge_updated_at,'t1');
  assert.equal(db.calls[0].args.p_expected_bridge_status,'open');
});
test('same queue is not treated as delivered when bridge still points to Tide',()=>{
  assert.equal(manualBridgePlan({enabled:true,toQueue:'pos_ml',currentQueue:'pos_ml',
    assignment:{assigned_to:'tide',status:'open'}}).unchanged,false);
  assert.equal(manualBridgePlan({enabled:true,toQueue:'pos_ml',currentQueue:'pos_ml',
    assignment:{assigned_to:'andrey',status:'open'}}).unchanged,false);
  assert.equal(manualBridgePlan({enabled:true,toQueue:'pos_nv',currentQueue:'pos_nv',
    assignment:{assigned_to:'andrey',status:'open'}}).unchanged,false);
});
test('missing RPC, denied access, unknown outcome or incomplete return never confirms delivery',async()=>{
  const plan=manualBridgePlan({enabled:true,toQueue:'pos_ml',currentQueue:'varejo_nv',assignment:current.assignment});
  for (const [data,error] of [[null,{code:'42883'}],[null,{code:'42501'}],[null,{code:'40001'}],
    [null,null],[{to_queue:'pos_ml',assigned_to:'tide',audit_recorded:true},null],
    [{to_queue:'pos_ml',assigned_to:'andrey',audit_recorded:false},null]]) {
    const db=fakeDb(data,error);
    const result=await transferManually({...args(db),plan,toQueue:'pos_ml'});
    assert.equal(result.confirmed,false);
    assert.equal(db.calls.length,1);
    assert.equal(db.calls[0].name,'crm_vital_transfer_argo_atomic');
  }
});
test('a network exception never triggers a second transfer or a legacy fallback',async()=>{
  let calls=0;
  const db={async rpc(name){calls++;assert.equal(name,'crm_vital_transfer_argo_atomic');throw new Error('timeout')}};
  const plan=manualBridgePlan({enabled:true,toQueue:'pos_ml',currentQueue:'varejo_nv',assignment:current.assignment});
  await assert.rejects(transferManually({...args(db),plan,toQueue:'pos_ml'}),/timeout/);
  assert.equal(calls,1);
});
