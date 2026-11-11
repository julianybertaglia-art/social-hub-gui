import test from 'node:test';
import assert from 'node:assert/strict';
import {createNuvemshopReader} from '../app/lib/server/nuvemshop-read.mjs';

const settings={storeId:'12345',accessToken:'fake-token',userAgent:'TidePlace (https://example.com/support)'};
test('read requests use the fixed official host, GET, bounded pagination and server-side auth',async()=>{
  const calls=[];
  const client=createNuvemshopReader({...settings,fetchImpl:async (url,options)=>{
    calls.push({url,options});return new Response(JSON.stringify([{id:1}]),{status:200});
  }});
  for (const resource of ['products','customers','orders','checkouts'])
    assert.deepEqual(await client.list(resource,{page:2,perPage:30}),[{id:1}]);
  assert.equal(calls.length,4);
  for(const call of calls){
    const url=new URL(call.url);
    assert.equal(url.origin,'https://api.nuvemshop.com.br');
    assert.equal(url.searchParams.get('page'),'2');
    assert.equal(url.searchParams.get('per_page'),'30');
    assert.equal(call.options.method,'GET');
    assert.equal(call.options.redirect,'error');
    assert.equal(call.options.cache,'no-store');
    assert.equal(call.options.headers.Authorization,'Bearer fake-token');
  }
});
test('invalid store, resources and pagination fail before any request',async()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;throw new Error('unexpected')};
  assert.throws(()=>createNuvemshopReader({...settings,storeId:'1/../another',fetchImpl}),/Loja/);
  assert.throws(()=>createNuvemshopReader({...settings,accessToken:'',fetchImpl}),/não configurada/);
  const client=createNuvemshopReader({...settings,fetchImpl});
  for(const resource of ['https://other.test','../orders','webhooks','']){
    await assert.rejects(client.list(resource),{code:'resource'});
  }
  await assert.rejects(client.list('orders',{perPage:51}),{code:'pagination'});
  await assert.rejects(client.list('orders',{page:0}),{code:'pagination'});
  assert.equal(calls,0);
});
test('upstream and transport failures are safe, do not leak tokens, and are not retried',async()=>{
  for(const [status,code] of [[401,'authorization'],[402,'account'],[403,'authorization'],[429,'rate_limit'],[500,'upstream']]){
    let calls=0;
    const client=createNuvemshopReader({...settings,fetchImpl:async()=>{
      calls++;return new Response('fake-token',{status});
    }});
    await assert.rejects(client.list('orders'),e=>e.code===code && !e.message.includes('fake-token'));
    assert.equal(calls,1);
  }
  const client=createNuvemshopReader({...settings,fetchImpl:async()=>{throw new Error('fake-token')}});
  await assert.rejects(client.list('orders'),e=>e.code==='network'&&!e.message.includes('fake-token'));
});
test('non-array or malformed responses are not mistaken for valid store data',async()=>{
  for(const content of ['{}','not json']){
    const client=createNuvemshopReader({...settings,fetchImpl:async()=>new Response(content,{status:200})});
    await assert.rejects(client.list('orders'),{code:'response'});
  }
});
