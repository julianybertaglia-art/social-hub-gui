import test from 'node:test';
import assert from 'node:assert/strict';
import {metaRejectionIsDefinitive,reserveViviHandoff,restoreViviHandoff} from '../app/lib/vital-crm-handoff.mjs';

function fakeDb(initial) {
  let row=initial?{...initial}:null;
  const db={from(){
    let operation,values,filters=[];
    const chain={
      update(v){operation='update';values=v;return chain;},
      insert(v){operation='insert';values=v;return chain;},
      delete(){operation='delete';return chain;},
      eq(key,value){filters.push([key,value]);return chain;},
      async select(){
        if(operation==='insert') {
          if(row)return {data:null,error:{code:'23505'}};
          row={...values};return {data:[{contact_wa_id:row.contact_wa_id}],error:null};
        }
        if(!row||!filters.every(([key,value])=>row[key]===value))return {data:[],error:null};
        const selected={contact_wa_id:row.contact_wa_id};
        if(operation==='delete')row=null;
        else row={...row,...values};
        return {data:[selected],error:null};
      },
    };return chain;
  },read(){return row?{...row}:null;},change(values){row={...row,...values};}};
  return db;
}
const previous={connection_id:'c',owner_user_id:'o',contact_wa_id:'5511999999999',
 stage:'products',selection:'Produtos Vital Decor',human_handoff:false,manual_override:false,
 last_interaction_at:'2026-11-10T12:00:00Z',updated_at:'2026-11-10T12:00:00Z'};
const args={connectionId:'c',ownerId:'o',contact:'5511999999999',previous,marker:'2026-11-10T12:01:00Z'};

test('distinguishes an explicit rejection from an uncertain send outcome',()=>{
 assert.equal(metaRejectionIsDefinitive(403,{error:{code:10}}),true);
 assert.equal(metaRejectionIsDefinitive(500,{error:{code:1}}),false);
 assert.equal(metaRejectionIsDefinitive(400,{}),false);
 assert.equal(metaRejectionIsDefinitive(400,{error:{},messages:[{id:'accepted'}]}),false);
});
test('reserves and restores the previous Vivi state after a definite rejection',async()=>{
 const db=fakeDb(previous);
 assert.equal((await reserveViviHandoff(db,args)).ok,true);
 assert.equal(db.read().selection,previous.selection);
 assert.equal(db.read().human_handoff,true);
 assert.equal(db.read().manual_override,true);
 assert.equal(db.read().stage,'await_human');
 assert.equal(await restoreViviHandoff(db,args),true);
 for(const field of ['stage','selection','human_handoff','manual_override','last_interaction_at'])
  assert.equal(db.read()[field],previous[field]);
});
test('does not overwrite a session changed before reservation or after reservation',async()=>{
 const db=fakeDb({...previous,updated_at:'later'});
 assert.equal((await reserveViviHandoff(db,args)).ok,false);
 const db2=fakeDb(previous);
 assert.equal((await reserveViviHandoff(db2,args)).ok,true);
 db2.change({stage:'menu',updated_at:'later'});
 assert.equal(await restoreViviHandoff(db2,args),false);
 assert.equal(db2.read().stage,'menu');
});
test('removes only the session created by the rejected reply, and refuses a concurrent insert',async()=>{
 const db=fakeDb(null), fresh={...args,previous:null};
 assert.equal((await reserveViviHandoff(db,fresh)).ok,true);
 assert.equal(await restoreViviHandoff(db,fresh),true);
 assert.equal(db.read(),null);
 const already=fakeDb(previous);
 assert.deepEqual(await reserveViviHandoff(already,fresh),{ok:false,reason:'changed'});
});
