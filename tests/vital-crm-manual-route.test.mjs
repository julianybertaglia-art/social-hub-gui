import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Exercise the actual PATCH route; only external services are replaced.
const routeUrl=new URL('../app/api/crm/vital/live/route.js',import.meta.url);
let source=await readFile(routeUrl,'utf8');
source=source
  .replace("import { getVitalCrmMember } from '../../../../lib/vital-crm-access.mjs';",
    "const getVitalCrmMember = (...args) => globalThis.__manualBridgeFixture.auth(...args);")
  .replace("import { fail } from '../../../vital-connections/helpers.mjs';",
    "const fail = (message,status) => Object.assign(new Error(message),{status});")
  .replace("import {canReplyWithinWindow} from '../../../vital-whatsapp/conversations/inbox.mjs';",
    "const canReplyWithinWindow = () => false;")
  .replace("import {readRows} from '../../../../lib/operations.mjs';",
    "const readRows = () => { throw new Error('Unexpected GET'); };")
  .replace("'../../../../lib/vital-crm-queues.mjs'", JSON.stringify(new URL('../app/lib/vital-crm-queues.mjs',import.meta.url).href))
  .replace("'../../../../lib/vital-crm-manual-bridge.mjs'", JSON.stringify(new URL('../app/lib/vital-crm-manual-bridge.mjs',import.meta.url).href));
const {PATCH}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

function fixture({assignment={assigned_to:'tide',status:'open',sector:'comercial_vital',updated_at:'t1'},
  override=null, rpcData='pos_ml', rpcError=null, role='owner'}={}) {
  const calls=[];
  const rows={
    workspace_meta_connections:{id:'conn'},
    crm_vital_member_queues:[],
    crm_vital_queues:[
      {queue_code:'varejo_nv'}, {queue_code:'pos_ml'}, {queue_code:'pos_nv'},
    ],
    crm_vital_queue_assignments:override,
    vital_whatsapp_flow_sessions:{selection:'Produtos Vital Decor'},
    vital_whatsapp_assignments:assignment,
    crm_vital_conversation_states:null,
    workspace_meta_messages:{id:'message'},
  };
  const db={
    from(table) {
      const chain={
        select(){return chain},eq(){return chain},limit(){return chain},
        order(){return chain},maybeSingle:async()=>({data:rows[table],error:null}),
        then(resolve,reject){return Promise.resolve({data:rows[table],error:null}).then(resolve,reject)},
      };
      return chain;
    },
    async rpc(name,args){calls.push({name,args});return {data:rpcData,error:rpcError}},
  };
  return {calls,auth:async()=>({db,access:{role},organization:{id:'org',ownerUserId:'owner'},userId:'owner'})};
}
function request(toQueue,origin='https://tide.test'){
  return new Request('https://tide.test/api/crm/vital/live',{
    method:'PATCH',headers:{origin,'content-type':'application/json'},
    body:JSON.stringify({contact:'5511999999999',toQueue}),
  });
}
async function run(f,enabled,toQueue='pos_ml',origin=undefined){
  globalThis.__manualBridgeFixture=f;
  process.env.VITAL_CRM_WRITES_ENABLED='true';
  if(enabled)process.env.VITAL_CRM_ARGO_MANUAL_ENABLED='true';
  else delete process.env.VITAL_CRM_ARGO_MANUAL_ENABLED;
  try {const response=await PATCH(request(toQueue,origin));return {status:response.status,body:await response.json()}}
  finally {delete globalThis.__manualBridgeFixture;delete process.env.VITAL_CRM_WRITES_ENABLED;delete process.env.VITAL_CRM_ARGO_MANUAL_ENABLED}
}
test('disabled bridge preserves the existing transfer route',async()=>{
  const f=fixture();
  const result=await run(f,false);
  assert.equal(result.status,200);
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].name,'crm_vital_transfer_atomic');
});
test('enabled bridge confirms marketplace only after one atomic response',async()=>{
  const f=fixture({rpcData:{to_queue:'pos_ml',assigned_to:'andrey',audit_recorded:true}});
  const result=await run(f,true);
  assert.equal(result.status,200);
  assert.equal(result.body.toQueue,'pos_ml');
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].name,'crm_vital_transfer_argo_atomic');
  assert.equal(f.calls[0].args.p_assignee,'andrey');
});
test('moving a conversation from Andrey to the site plans return to Tide',async()=>{
  const f=fixture({override:{queue_code:'pos_ml',updated_at:'before'},assignment:{
    assigned_to:'andrey',status:'open',sector:'pos_venda',updated_at:'bridge-before'},
    rpcData:{to_queue:'pos_nv',assigned_to:'tide',audit_recorded:true}});
  const result=await run(f,true,'pos_nv');
  assert.equal(result.status,200);
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].args.p_assignee,'tide');
  assert.equal(f.calls[0].args.p_expected_bridge_updated_at,'bridge-before');
});
test('missing database operation fails closed without legacy fallback',async()=>{
  const f=fixture({rpcData:null,rpcError:{code:'42883'}});
  const result=await run(f,true);
  assert.equal(result.status,503);
  assert.match(result.body.error,/confirmar/);
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].name,'crm_vital_transfer_argo_atomic');
});
test('choosing the same marketplace queue still reconciles an assignment left in Tide',async()=>{
  const f=fixture({override:{queue_code:'pos_ml',updated_at:'before'},
    assignment:{assigned_to:'tide',status:'open',sector:'pos_venda',updated_at:'bridge-before'},
    rpcData:{to_queue:'pos_ml',assigned_to:'andrey',audit_recorded:true}});
  const result=await run(f,true);
  assert.equal(result.status,200);
  assert.equal(result.body.unchanged,undefined);
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].name,'crm_vital_transfer_argo_atomic');
});
test('a conflict or in-flight reply is reported without retry or fallback',async()=>{
  for(const code of ['40001','55P03']){
    const f=fixture({rpcData:null,rpcError:{code}});
    const result=await run(f,true);
    assert.equal(result.status,409);
    assert.equal(f.calls.length,1);
    assert.equal(f.calls[0].name,'crm_vital_transfer_argo_atomic');
  }
});
test('an incomplete atomic response never claims success',async()=>{
  const f=fixture({rpcData:{to_queue:'pos_ml',assigned_to:'andrey',audit_recorded:false}});
  const result=await run(f,true);
  assert.equal(result.status,503);
  assert.equal(f.calls.length,1);
});
test('bad origin and unauthorized role cannot call either transfer operation',async()=>{
  const a=fixture();
  assert.equal((await run(a,true,'pos_ml','https://wrong.test')).status,403);
  assert.equal(a.calls.length,0);
  const b=fixture({role:'agent'});
  assert.equal((await run(b,true)).status,403);
  assert.equal(b.calls.length,0);
});
