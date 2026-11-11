import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Exercise the real route with authenticated-session and upstream services simulated.
let src=await readFile(new URL('../app/api/crm/vital/store/route.js',import.meta.url),'utf8');
src=src.replace("import {getSupabaseAdmin} from '../../../whatsapp/lib';",
  "const getSupabaseAdmin = () => globalThis.__storeFixture.db;")
  .replace("import {bearerToken} from '../../../vital-connections/helpers.mjs';",
  "const bearerToken = () => 'fake-session';")
  .replace("'../../../../lib/server/vital-store-session.mjs'",JSON.stringify(new URL('../app/lib/server/vital-store-session.mjs',import.meta.url).href))
  .replace("'../../../../lib/server/nuvemshop-read.mjs'",JSON.stringify(new URL('../app/lib/server/nuvemshop-read.mjs',import.meta.url).href))
  .replace("'../../../../lib/server/nuvemshop-project.mjs'",JSON.stringify(new URL('../app/lib/server/nuvemshop-project.mjs',import.meta.url).href))
  .replace("'../../../../lib/server/vital-store-rate-limit.mjs'",JSON.stringify(new URL('../app/lib/server/vital-store-rate-limit.mjs',import.meta.url).href));
const {GET}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));

function fixture({userId='ju-id',role='owner',status='active',memberOrg='org',memberError=null,
  fetchStatus=200,body=JSON.stringify([{id:4,name:'Exemplo',identification:'private-doc'}]),
  claim=true,claimError=null}={}){
  let fetchCalls=0;const rpcCalls=[];
  const member={organization_id:memberOrg,user_id:userId,role,status};
  const db={auth:{async getUser(){return {data:{user:{id:userId}},error:null}}},
    async rpc(name,args){rpcCalls.push({name,args});return name==='crm_vital_store_request_claim'
      ? {data:claim,error:claimError}:{data:true,error:null}},from(table){
    const chain={select(){return chain},eq(){return chain},async maybeSingle(){return table==='crm_organizations'
      ? {data:{id:'11111111-1111-4111-8111-111111111111',workspace_code:'vital-decor',owner_user_id:'ju-id'},error:null}
      : {data:{...member,organization_id:memberOrg==='org'?'11111111-1111-4111-8111-111111111111':memberOrg},error:memberError}}};
    return chain;
  }};
  return {
    db,
    fetch:async()=>{fetchCalls++;return new Response(body,{status:fetchStatus})},
    get calls(){return fetchCalls},
    get rpcCalls(){return rpcCalls},
  };
}
async function run(f,{enabled=true,gui='gui-id',resource='customers',storeId='7938728',token='fake-secret'}={}){
  const oldFetch=globalThis.fetch,keys=['VITAL_STORE_READ_ENABLED','VITAL_STORE_GUILHERME_USER_ID','VITAL_STORE_ORGANIZATION_ID',
    'NUVEMSHOP_VITAL_STORE_ID','NUVEMSHOP_VITAL_ACCESS_TOKEN','NUVEMSHOP_VITAL_USER_AGENT'];
  const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  globalThis.__storeFixture=f;globalThis.fetch=f.fetch;
  process.env.VITAL_STORE_READ_ENABLED=enabled?'true':'false';
  process.env.VITAL_STORE_ORGANIZATION_ID='11111111-1111-4111-8111-111111111111';
  if(gui)process.env.VITAL_STORE_GUILHERME_USER_ID=gui;else delete process.env.VITAL_STORE_GUILHERME_USER_ID;
  process.env.NUVEMSHOP_VITAL_STORE_ID=storeId;
  if(token)process.env.NUVEMSHOP_VITAL_ACCESS_TOKEN=token;else delete process.env.NUVEMSHOP_VITAL_ACCESS_TOKEN;
  process.env.NUVEMSHOP_VITAL_USER_AGENT='TidePlace (https://example.test)';
  try {
    const response=await GET(new Request('https://tide.test/api/crm/vital/store?resource='+resource));
    return {status:response.status,body:await response.json(),headers:response.headers};
  } finally {
    globalThis.fetch=oldFetch;delete globalThis.__storeFixture;
    for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k]}
  }
}
test('feature flag blocks access before any store request',async()=>{
  const f=fixture();const result=await run(f,{enabled:false});
  assert.equal(result.status,503);assert.equal(f.calls,0);
});
test('owner and explicitly identified Guilherme can read the authorized projection',async()=>{
  for(const f of [fixture(),fixture({userId:'gui-id',role:'supervisor'})]){
    const result=await run(f);
    assert.equal(result.status,200);assert.equal(f.calls,1);
    assert.equal(result.body.items[0].name,'Exemplo');
    assert.equal(JSON.stringify(result.body).includes('private-doc'),false);
    assert.match(result.headers.get('cache-control'),/no-store/);
  }
});
test('Vitor, Andrey, other supervisors and inactive members cannot trigger a store request',async()=>{
  for(const f of [fixture({userId:'vitor-id',role:'agent'}),fixture({userId:'andrey-id',role:'agent'}),
    fixture({userId:'other-id',role:'supervisor'}),fixture({userId:'gui-id',role:'supervisor',status:'inactive'}),
    fixture({userId:'gui-id',role:'supervisor',memberOrg:'other'})]){
    const result=await run(f);
    assert.equal(result.status,403);assert.equal(f.calls,0);
  }
});
test('Guilherme remains blocked until his individual identity is configured',async()=>{
  const f=fixture({userId:'gui-id',role:'supervisor'});
  const result=await run(f,{gui:null});
  assert.equal(result.status,403);assert.equal(f.calls,0);
});
test('the access probe requires the same permissions and never calls the store',async()=>{
  const owner=fixture();const permitted=await run(owner,{resource:'access'});
  assert.equal(permitted.status,200);assert.equal(permitted.body.available,true);assert.equal(permitted.body.storeOnly,false);assert.equal(owner.calls,0);
  const gui=fixture({userId:'gui-id',role:'supervisor'});const storeOnly=await run(gui,{resource:'access'});
  assert.equal(storeOnly.status,200);assert.equal(storeOnly.body.available,true);assert.equal(storeOnly.body.storeOnly,true);assert.equal(gui.calls,0);
  const other=fixture({userId:'vitor-id',role:'agent'});const denied=await run(other,{resource:'access'});
  assert.equal(denied.status,403);assert.equal(other.calls,0);
  const inactive=fixture();const disabled=await run(inactive,{resource:'access',enabled:false});
  assert.equal(disabled.status,503);assert.equal(inactive.calls,0);
  const noToken=fixture();const unconfigured=await run(noToken,{resource:'access',token:null});
  assert.equal(unconfigured.status,503);assert.equal(noToken.calls,0);
});
test('a different store cannot be queried using the Vital CRM connection',async()=>{
  const f=fixture();const result=await run(f,{storeId:'99999'});
  assert.equal(result.status,503);assert.equal(f.calls,0);
});
test('failed membership lookup, unknown resource and upstream errors do not leak details',async()=>{
  const badMember=fixture({memberError:{message:'secret'}});
  assert.equal((await run(badMember)).status,503);assert.equal(badMember.calls,0);
  const invalid=fixture();
  assert.equal((await run(invalid,{resource:'webhooks'})).status,400);assert.equal(invalid.calls,0);
  assert.equal(invalid.rpcCalls.length,0);
  const upstream=fixture({fetchStatus:401,body:'fake-secret'});
  const result=await run(upstream);
  assert.equal(result.status,503);assert.equal(upstream.calls,1);
  assert.equal(JSON.stringify(result.body).includes('fake-secret'),false);
});
test('rate control is shared through the database and fails closed if absent or busy',async()=>{
  for(const f of [fixture({claim:false}),fixture({claimError:{message:'private'}}),fixture({claim:null})]){
    const result=await run(f);
    assert.ok([429,503].includes(result.status));assert.equal(f.calls,0);
    assert.equal(f.rpcCalls[0].name,'crm_vital_store_request_claim');
    assert.equal(f.rpcCalls[0].args.p_organization_id,'11111111-1111-4111-8111-111111111111');
    assert.equal(JSON.stringify(result.body).includes('private'),false);
  }
});
test('an upstream 429 pauses future claims through the shared limiter and is not retried',async()=>{
  const f=fixture({fetchStatus:429});const result=await run(f);
  assert.equal(result.status,429);assert.equal(f.calls,1);
  assert.deepEqual(f.rpcCalls.map(c=>c.name),['crm_vital_store_request_claim','crm_vital_store_request_backoff']);
});
