import test from 'node:test';
import assert from 'node:assert/strict';
import {crmFilter,crmLane,crmLanes,crmContactKey,crmLaneLabel} from '../app/lib/crm-view.mjs';

const records = [
  {id:'shared',profile_name:'João',phone:'11999999999',stage:'Novo lead',sector:'atacado',tags:['jardim vertical'],last_message_at:'2026-10-20T12:00:00Z'},
  {id:'other',profile_name:'Ana',phone:'11888888888',stage:'Venda',sector:'pos_venda',tags:[],last_message_at:'2026-10-22T12:00:00Z'},
];

test('independent workspaces never confuse sales stages with service sectors',()=>{
  assert.equal(crmLane('gui-nonato',records[0]),'Novo lead');
  assert.equal(crmLane('vital-decor',records[0]),'atacado');
  assert.ok(crmLanes('gui-nonato',records).includes('Venda'));
  assert.ok(crmLanes('vital-decor',records).includes('pos_venda'));
  assert.ok(!crmLanes('vital-decor',records).includes('Venda'));
  assert.notEqual(crmContactKey('gui-nonato',records[0]),crmContactKey('vital-decor',records[0]));
});

test('search is accent insensitive, scoped to selected lane and sorted by latest',()=>{
  assert.deepEqual(crmFilter(records,'vital-decor',{search:'joao',lane:'atacado'}).map(c=>c.id),['shared']);
  assert.deepEqual(crmFilter(records,'gui-nonato',{lane:'Venda'}).map(c=>c.id),['other']);
  assert.deepEqual(crmFilter(records,'vital-decor',{}).map(c=>c.id),['other','shared']);
  assert.deepEqual(crmFilter(records,'vital-decor',{sort:'name'}).map(c=>c.id),['other','shared']);
  assert.equal(crmLaneLabel('pos_venda'),'Pós-venda');
});

test('handles missing CRM fields without crashing',()=>{
  assert.deepEqual(crmFilter([{id:1}], 'vital-decor', {search:'abacaxi'}),[]);
  assert.equal(crmLane('vital-decor',{}),'Sem setor');
  assert.ok(crmLanes('gui-nonato',[{stage:'Customizado'}]).includes('Customizado'));
});
