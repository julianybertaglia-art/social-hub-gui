import test from 'node:test';
import assert from 'node:assert/strict';
import {periodRange,numberOrNull,aggregateMessages,crmMetrics,delta,csvCell,readRows} from '../app/lib/operations.mjs';
const range=periodRange(7,new Date('2026-10-15T12:00:00Z'));
test('complete-day comparisons follow Sao Paulo and do not include today',()=>{
 assert.equal(range.start,'2026-10-08T03:00:00.000Z');assert.equal(range.end,'2026-10-15T03:00:00.000Z');assert.equal(range.previousStart,'2026-10-01T03:00:00.000Z');
 assert.equal(periodRange(7,new Date('2026-10-15T01:00:00Z')).endDate,'2026-10-13');
 assert.equal(periodRange(999).days,30);
});
test('zero is real, unavailable metrics and undefined growth stay unavailable',()=>{
 for(const v of [null,undefined,'',true,'not-a-number'])assert.equal(numberOrNull(v),null);
 assert.equal(numberOrNull(0),0);assert.equal(delta(10,0),null);assert.equal(delta(null,10),null);assert.equal(delta(0,10),-100);assert.equal(delta(15,10),50);
});
test('message periods do not double-count boundary records',()=>{
 const rows=[{direction:'inbound',sent_at:range.start},{direction:'inbound',sent_at:range.end},{direction:'outbound',sent_at:'2026-10-09T02:59:59Z'},{direction:'inbound',sent_at:range.previousStart},{direction:'inbound',sent_at:'invalid'}];
 const result=aggregateMessages(rows,range);assert.equal(result.inbound,1);assert.equal(result.outbound,1);assert.equal(result.previousInbound,1);assert.equal(result.daily.length,7);assert.deepEqual(result.daily[0],{date:'2026-10-08',inbound:1,outbound:1});
});
test('CRM counts current status separately from lead creation cohorts',()=>{
 const result=crmMetrics([{stage:'Venda',created_at:range.previousStart},{stage:'Perdido',created_at:range.start},{stage:'Conversando',created_at:range.start}],range);
 assert.equal(result.closedWinRate,50);assert.equal(result.open,1);assert.equal(result.newLeads,2);assert.equal(result.previousNewLeads,1);assert.equal(crmMetrics([],range).closedWinRate,null);
});
test('pagination fetches records beyond PostgREST first page without hiding errors',async()=>{
 const rows=Array.from({length:2448},(_,id)=>({id}));let calls=0;const result=await readRows(()=>({range:async(start,end)=>{calls++;return {data:rows.slice(start,end+1)};}}),10000);
 assert.equal(result.data.length,2448);assert.equal(calls,5);assert.equal(new Set(result.data.map(r=>r.id)).size,2448);
 const failure=await readRows(()=>({range:async()=>({error:'unavailable'})}),1000);assert.equal(failure.error,'unavailable');assert.equal(failure.data,undefined);
 const capped=await readRows(()=>({range:async(start,end)=>({data:rows.slice(start,end+1)})}),1000);assert.equal(capped.data.length,1000);
});
test('CSV escapes quotes and neutralizes spreadsheet formulas',()=>{
 assert.equal(csvCell('=1+1'),'"\'=1+1"');assert.equal(csvCell('Oi "Ju"'),'"Oi ""Ju"""');assert.equal(csvCell(null),'""');
});
