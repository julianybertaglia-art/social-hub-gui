import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAuthorizedVitalContact} from '../app/lib/vital-crm-context.mjs';

function fakeDb({manual=null,selection='Pós-venda · Shopee',sector='pos_venda',state=null,grants=[]}={}){
 const queried=[];
 const values={
  crm_vital_queue_assignments:manual,
  vital_whatsapp_flow_sessions:selection?{selection}:null,
  vital_whatsapp_assignments:sector?{sector,status:'open',assigned_to:'tide'}:null,
  crm_vital_conversation_states:state,
  crm_vital_member_queues:grants,
 };
 return {queried,from(name){
  queried.push(name);
  const data=values[name];
  const query={select(){return query;},eq(){return query;},maybeSingle(){return Promise.resolve({data,error:null});},
   then(resolve,reject){return Promise.resolve({data:Array.isArray(data)?data:[],error:null}).then(resolve,reject);}};
  return query;
 }};
}
const base={organization:{id:'org-1',ownerUserId:'owner-1'},connection:{id:'conn-1'},userId:'agent-1'};

test('agent contact access comes from persisted grants and current manual routing wins',async()=>{
 const db=fakeDb({manual:{queue_code:'pos_ml',updated_at:'2026-11-03T00:00:00Z'},grants:[{queue_code:'pos_shopee'}]});
 await assert.rejects(resolveAuthorizedVitalContact({...base,db,access:{role:'agent'},phone:'5511998877665'}),error=>error.status===404);
 assert.ok(!db.queried.includes('workspace_meta_messages'));
});

test('agent can read a granted contact, and never loads bodies before queue validation',async()=>{
 const db=fakeDb({grants:[{queue_code:'pos_shopee'}]});
 const result=await resolveAuthorizedVitalContact({...base,db,access:{role:'agent'},phone:'5511998877665'});
 assert.equal(result.queue,'pos_shopee');
 assert.deepEqual(db.queried.sort(),[
  'crm_vital_conversation_states','crm_vital_member_queues','crm_vital_queue_assignments',
  'vital_whatsapp_assignments','vital_whatsapp_flow_sessions',
 ].sort());
});

test('supervisor needs a grant too and unknown routing fails closed',async()=>{
 const noGrant=fakeDb({grants:[]});
 await assert.rejects(resolveAuthorizedVitalContact({...base,db:noGrant,access:{role:'supervisor'},phone:'5511998877665'}),error=>error.status===404);
 const unknown=fakeDb({selection:'',sector:'pos_venda',grants:[{queue_code:'pos_shopee'}]});
 await assert.rejects(resolveAuthorizedVitalContact({...base,db:unknown,access:{role:'agent'},phone:'5511998877665'}),error=>error.status===404);
});

test('invalid phone identifiers are rejected before any database lookup',async()=>{
 const db=fakeDb();
 await assert.rejects(resolveAuthorizedVitalContact({...base,db,access:{role:'owner'},phone:'not-a-phone'}),error=>error.status===400);
 assert.deepEqual(db.queried,[]);
});
