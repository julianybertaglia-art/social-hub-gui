import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleNavGroups,matchesNavigation,searchNavigation} from '../app/ui/navigation.js';

const flatten=workspace=>visibleNavGroups(workspace).flatMap(g=>g.items);

test('Social and CRM separate the existing functional navigation without duplicate routes',()=>{
 for(const workspace of ['gui-nonato','vital-decor']){
  const groups=visibleNavGroups(workspace);
  assert.deepEqual(groups.map(g=>g.label),['SOCIAL STUDIO','TIDE CRM','CONFIGURAÇÕES']);
  assert.equal(visibleNavGroups(workspace,'studio').length,1);
  assert.equal(visibleNavGroups(workspace,'crm').length,1);
  const urls=flatten(workspace).map(i=>i.href);
  assert.equal(urls.length,new Set(urls).size);
  assert.ok(urls.includes('/whatsapp'));
  assert.ok(urls.includes('/?section=calendar'));
  assert.ok(urls.includes('/?section=ideas'));
  assert.ok(urls.includes('/?section=goals'));
 }
});
test('workspace permissions remain isolated and sensitive routes remain unchanged',()=>{
 const gui=flatten('gui-nonato').map(i=>i.href);
 const vital=flatten('vital-decor').map(i=>i.href);
 assert.ok(gui.includes('/whatsapp/campanha'));
 assert.ok(!vital.includes('/whatsapp/campanha'));
 assert.ok(gui.includes('/crm'));
 assert.ok(!vital.includes('/crm'));
 assert.ok(vital.includes('/whatsapp/setores'));
 assert.ok(!gui.includes('/whatsapp/setores'));
 assert.ok(vital.includes('/whatsapp/integracao-argo'));
 assert.ok(!gui.includes('/whatsapp/integracao-argo'));
 assert.ok(vital.includes('/conexoes/vital-decor'));
 assert.ok(!gui.includes('/conexoes/vital-decor'));
});
test('hide abandoned tools from menu without altering their routes or stored content',()=>{
 const all=flatten('gui-nonato').map(i=>i.href);
 assert.ok(!all.includes('/radar'));
 assert.ok(!all.includes('/criar-post'));
 assert.ok(!all.includes('/conteudo/ia'));
});
test('search remains accent insensitive and scoped to selected workspace',()=>{
 assert.ok(searchNavigation('metricas','gui-nonato').some(i=>i.label==='Métricas'));
 assert.ok(searchNavigation('conexoes vital','vital-decor').some(i=>i.href==='/conexoes/vital-decor'));
 assert.equal(searchNavigation('integracao argo','gui-nonato').length,0);
});
test('active navigation only matches the intended section or route',()=>{
 const studio=flatten('gui-nonato');
 const tasks=studio.find(i=>i.section==='tasks');
 assert.equal(matchesNavigation(tasks,'/','tasks'),true);
 assert.equal(matchesNavigation(tasks,'/','dashboard'),false);
 assert.equal(matchesNavigation(tasks,'/whatsapp','tasks'),false);
 const inbox=studio.find(i=>i.href==='/whatsapp');
 assert.equal(matchesNavigation(inbox,'/whatsapp'),true);
 assert.equal(matchesNavigation(inbox,'/whatsapp/gato'),false);
});
