import test from 'node:test';
import assert from 'node:assert/strict';
import {canCrmAccess,crmMemberAccess} from '../app/lib/crm-authorization.mjs';

test('unrecognized and inactive profiles are rejected by default',()=>{
 assert.equal(crmMemberAccess({role:'unknown'}),null);
 assert.equal(canCrmAccess({role:'agent',status:'suspended',sectors:['pos_venda']},'read_conversation','pos_venda'),false);
 assert.equal(canCrmAccess(undefined,'read_conversation','pos_venda'),false);
});
test('Vital attendant is limited to their authorized sector even when request names another',()=>{
 const user={role:'agent',status:'active',sectors:['pos_venda']};
 assert.equal(canCrmAccess(user,'read_conversation','pos_venda'),true);
 assert.equal(canCrmAccess(user,'reply_conversation','pos_venda'),true);
 assert.equal(canCrmAccess(user,'read_conversation','atacado'),false);
 assert.equal(canCrmAccess(user,'read_conversation',''),false);
 assert.equal(canCrmAccess(user,'assign_conversation','pos_venda'),false);
});
test('supervisor requires explicit sectors and owner can manage across sectors',()=>{
 assert.equal(canCrmAccess({role:'supervisor',sectors:['atacado']},'assign_conversation','atacado'),true);
 assert.equal(canCrmAccess({role:'supervisor',sectors:['atacado']},'read_conversation','pos_venda'),false);
 assert.equal(canCrmAccess({role:'owner',sectors:[]},'read_conversation','pos_venda'),true);
 assert.equal(canCrmAccess({role:'owner'},'assign_conversation','atacado'),true);
});
test('future installer role cannot read CRM chats or appointments before appointment-specific policy exists',()=>{
 const installer={role:'installer',sectors:['instalacoes']};
 assert.equal(canCrmAccess(installer,'read_conversation','pos_venda'),false);
 assert.equal(canCrmAccess(installer,'view_appointments','instalacoes'),false);
});
