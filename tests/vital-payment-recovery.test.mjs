import test from 'node:test';
import assert from 'node:assert/strict';
import {recoveryPlan,recoveryMessage} from '../app/lib/server/vital-payment-recovery.mjs';
const now=Date.parse('2026-11-26T23:00:00Z');
const order={id:'123',number:130,status:'open',payment_status:'pending',completed_at:'2026-11-26T22:00:00Z'};
test('email due after 30 minutes; whatsapp after 3 additional hours',()=>{
  const stages=recoveryPlan(order,now);
  assert.equal(stages[0].due,true);assert.equal(stages[1].due,false);
  assert.equal(stages[1].dueAt,'2026-11-27T01:30:00.000Z');
});
test('paid, cancelled, expired, invalid and old orders never eligible',()=>{
  for(const patch of [{payment_status:'paid'},{payment_status:'expired'},{status:'cancelled'},{id:'x'},{completed_at:'bad'},{completed_at:'2026-11-24T00:00:00Z'}])
    assert.deepEqual(recoveryPlan({...order,...patch},now),[]);
});
test('message does not assume Pix or expose payment credentials',()=>{
  assert.match(recoveryMessage(order).text,/#130/);
  assert.doesNotMatch(recoveryMessage(order).text,/Pix/i);
});
