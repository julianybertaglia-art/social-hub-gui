import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatchRecoveryEmail} from '../app/lib/server/vital-payment-dispatch.mjs';
const now=()=>Date.parse('2026-11-26T23:00:00Z');
const order={id:'123',number:130,status:'open',payment_status:'pending',completed_at:'2026-11-26T22:00:00Z',contact_email:'test@example.com'};
function fixture({duplicate=false,paid=false,fail=false}={}){
 let reads=0,sends=0,state;
 const db={from:()=>({insert:async()=>({error:duplicate?{code:'23505'}:null}),update:p=>({match:()=>({eq:()=>({select:()=>({single:async()=>{state=p.state;return {data:{state}}}})})})})};
 return {args:{db,organizationId:'org',storeId:'123',orderId:'123',now,enabled:true,readOrder:async()=>({...order,payment_status:paid&&++reads>1?'paid':'pending'}),sendEmail:async()=>{sends++;if(fail)throw Error();return {id:'receipt'}}},get sends(){return sends},get state(){return state}};
}
test('disabled never sends',async()=>{const f=fixture();assert.equal((await dispatchRecoveryEmail({...f.args,enabled:false})).state,'disabled');assert.equal(f.sends,0)});
test('duplicate never sends',async()=>{const f=fixture({duplicate:true});assert.equal((await dispatchRecoveryEmail(f.args)).state,'duplicate');assert.equal(f.sends,0)});
test('paid between checks is skipped',async()=>{const f=fixture({paid:true});assert.equal((await dispatchRecoveryEmail(f.args)).state,'skipped');assert.equal(f.sends,0)});
test('provider acceptance recorded',async()=>{const f=fixture();assert.equal((await dispatchRecoveryEmail(f.args)).state,'sent');assert.equal(f.sends,1)});
test('ambiguous response is not retried',async()=>{const f=fixture({fail:true});assert.equal((await dispatchRecoveryEmail(f.args)).state,'uncertain');assert.equal(f.sends,1)});
