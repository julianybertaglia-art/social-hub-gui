import test from 'node:test';
import assert from 'node:assert/strict';
import {DEMO_SCOPES,DEMO_CONTACTS,demoConversationsFor,demoConversationDetail} from '../app/lib/crm-portal-demo.mjs';

test('example conversations are fictional and separated by simulated sector',()=>{
 assert.ok(DEMO_CONTACTS.length>=4);
 assert.deepEqual([...new Set(demoConversationsFor('pos_venda').map(x=>x.sector))],['pos_venda']);
 assert.deepEqual([...new Set(demoConversationsFor('atacado').map(x=>x.sector))],['atacado']);
 assert.deepEqual([...new Set(demoConversationsFor('comercial_vital').map(x=>x.sector))],['comercial_vital']);
 assert.equal(demoConversationsFor('invalid').length,0);
});
test('supervisor sees only two sectors while other sectors remain hidden',()=>{
 const allowed=DEMO_SCOPES.supervisora.sectors;
 assert.deepEqual([...new Set(demoConversationsFor('supervisora').map(x=>x.sector))].sort(),allowed.slice().sort());
 assert.equal(demoConversationsFor('supervisora').some(x=>x.sector==='atacado'),false);
});
test('direct contact detail cannot escape the simulated role',()=>{
 const restricted=demoConversationsFor('pos_venda')[0];
 assert.ok(demoConversationDetail('pos_venda',restricted.id));
 assert.equal(demoConversationDetail('atacado',restricted.id),null);
 assert.equal(demoConversationDetail('pos_venda','not-a-real-contact'),null);
 assert.equal(demoConversationDetail('pos_venda',restricted.id).readOnly,true);
});
