import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Exercise the real route with authenticated-session and upstream services simulated.
let src=await readFile(new URL('../app/api/crm/vital/store/route.js',import.meta.url),'utf8');
src=src.replace("import {getVitalCrmMember} from '../../../../lib/vital-crm-access.mjs';",
  "const getVitalCrmMember = (...args) => globalThis.__storeFixture.auth(...args);")
  .replace("'../../../../lib/server/vital-store-access.mjs'",JSON.stringify(new URL('../app/lib/server/vital-store-access.mjs',import.meta.url).href))
  .replace("'../../../../lib/server/nuvemshop-read.mjs'",JSON.stringify(new URL('../app/lib/server/nuvemshop-read.mjs',import.meta.url).href))
  .replace("'../../../../lib/server/nuvemshop-project.mjs'",JSON.stringify(new URL('../app/lib/server/nuvemshop-project.mjs',import.meta.url).href));
const {GET}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));

function fixture({userId='ju-id',role='owner',status='active',memberOrg='org',memberError=null,
  fetchStatus=200,body=JSON.stringify([{id:4,name:'Exemplo',identification:'private-doc'}])}={}){
  let fetchCalls=0;
  const member={organization_id:memberOrg,user_id:userId,role,status};
  const db={from(){
    const chain={select(){return chain},eq(){return chain},async maybeSingle(){return {data:member,error:memberError}}};
    return chain;
  }};
  return {
    auth:async()=>({db,userId,organization:{id:'org',workspaceCode:'vital-decor',ownerUserId:'ju-id'}}),
    fetch:async()=>{fetchCalls++;return new Response(body,{status:fetchStatus})},
    get calls(){return fetchCalls},
  };
}
async function run(f,{enabled=true,gui='gui-id',resource='customers',storeId='7938728'}={}){
  const oldFetch=globalThis.fetch,keys=['VITAL_STORE_READ_ENABLED','VITAL_STORE_GUILHERME_USER_ID',
    'NUVEMSHOP_VITAL_STORE_ID','NUVEMSHOP_VITAL_ACCESS_TOKEN','NUVEMSHOP_VITAL_USER_AGENT'];
  const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  globalThis.__storeFixture=f;globalThis.fetch=f.fetch;
  process.env.VITAL_STORE_READ_ENABLED=enabled?'true':'false';
  if(gui)process.env.VITAL_STORE_GUILHERME_USER_ID=gui;else delete process.env.VITAL_STORE_GUILHERME_USER_ID;
  process.env.NUVEMSHOP_VITAL_STORE_ID=storeId;
  process.env.NUVEMSHOP_VITAL_ACCESS_TOKEN='fake-secret';
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
test('a different store cannot be queried using the Vital CRM connection',async()=>{
  const f=fixture();const result=await run(f,{storeId:'99999'});
  assert.equal(result.status,503);assert.equal(f.calls,0);
});
test('failed membership lookup, unknown resource and upstream errors do not leak details',async()=>{
  const badMember=fixture({memberError:{message:'secret'}});
  assert.equal((await run(badMember)).status,503);assert.equal(badMember.calls,0);
  const invalid=fixture();
  assert.equal((await run(invalid,{resource:'webhooks'})).status,400);assert.equal(invalid.calls,0);
  const upstream=fixture({fetchStatus:401,body:'fake-secret'});
  const result=await run(upstream);
  assert.equal(result.status,503);assert.equal(upstream.calls,1);
  assert.equal(JSON.stringify(result.body).includes('fake-secret'),false);
});
