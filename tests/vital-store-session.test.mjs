import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveVitalStoreMember} from '../app/lib/server/vital-store-session.mjs';

const orgId='11111111-1111-4111-8111-111111111111';
const otherOrgId='22222222-2222-4222-8222-222222222222';
const organization={id:orgId,workspace_code:'vital-decor',owner_user_id:'owner'};
const makeDb=({userId='owner',role='owner',status='active',org=organization,
  memberOrg=orgId,memberUser=userId,anonymous=false,identityError=null,dbError=null}={})=>{
  const filters=[];
  const member={organization_id:memberOrg,user_id:memberUser,role,status};
  const db={auth:{async getUser(token){assert.equal(token,'valid-token');
    return {data:{user:userId?{id:userId,is_anonymous:anonymous}:null},error:identityError};}},
    from(table){const where={};const q={select(){return q},eq(key,value){where[key]=value;return q},
      async maybeSingle(){filters.push({table,where});
        if(dbError)return {data:null,error:dbError};
        const record=table==='crm_organizations'?org:member;
        return {data:record&&Object.entries(where).every(([k,v])=>record[k]===v)?record:null,error:null};
      }};return q;}};
  return {db,filters};
};
const run=(db,changes={})=>resolveVitalStoreMember({db,token:'valid-token',trustedOrganizationId:orgId,
  guilhermeUserId:'gui',...changes});

test('owner and explicitly configured Guilherme can use the store without enabling CRM staff access',async()=>{
  const prev=process.env.VITAL_CRM_STAFF_ENABLED;process.env.VITAL_CRM_STAFF_ENABLED='false';
  try{
    const owner=makeDb();assert.equal((await run(owner.db)).storeOnly,false);
    const gui=makeDb({userId:'gui',role:'supervisor'});
    assert.equal((await run(gui.db)).storeOnly,true);
    assert.deepEqual(gui.filters.find(f=>f.table==='crm_organizations').where,{id:orgId});
    assert.deepEqual(gui.filters.find(f=>f.table==='crm_organization_members').where,{organization_id:orgId,user_id:'gui'});
  }finally{if(prev===undefined)delete process.env.VITAL_CRM_STAFF_ENABLED;else process.env.VITAL_CRM_STAFF_ENABLED=prev;}
});

test('a different Vital organization cannot access this store, even if its caller owns it',async()=>{
  const forged=makeDb({userId:'attacker',role:'owner',memberOrg:otherOrgId,
    org:{id:otherOrgId,workspace_code:'vital-decor',owner_user_id:'attacker'}});
  await assert.rejects(run(forged.db),{status:403});
});

test('other users, suspended members and missing or incorrect identity fail closed',async()=>{
  for(const options of [{userId:'vitor',role:'agent'}, {userId:'gui',role:'supervisor',status:'suspended'},
    {userId:'gui',role:'supervisor',memberUser:'other'}, {userId:'gui',role:'supervisor',memberOrg:otherOrgId},
    {userId:'owner',role:'agent'}, {userId:'gui',role:'owner'}]){
    await assert.rejects(run(makeDb(options).db),{status:403});
  }
  await assert.rejects(run(makeDb({userId:'gui',role:'supervisor'}).db,{guilhermeUserId:undefined}),{status:403});
  await assert.rejects(run(makeDb({anonymous:true}).db),{status:401});
  await assert.rejects(run(makeDb({userId:null}).db),{status:401});
  await assert.rejects(run(makeDb().db,{token:''}),{status:401});
});

test('missing organization configuration or a database failure never opens access',async()=>{
  for(const id of [undefined,'','not-a-uuid'])await assert.rejects(run(makeDb().db,{trustedOrganizationId:id}),{status:503});
  await assert.rejects(run(makeDb({dbError:{message:'private'}}).db),e=>e.status===503&&!e.message.includes('private'));
});
