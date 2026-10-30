import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleNavGroups,matchesNavigation,searchNavigation} from '../app/ui/navigation.js';

const flatten=workspace=>visibleNavGroups(workspace).flatMap(group=>group.items);

test('Studio and CRM are separate navigation areas, without duplicating destinations',()=>{
 for(const workspace of ['gui-nonato','vital-decor']){
  const studio=visibleNavGroups(workspace,'studio');
  const crm=visibleNavGroups(workspace,'crm');
  assert.equal(studio.length,1);
  assert.equal(crm.length,1);
  assert.equal(studio[0].label,'SOCIAL STUDIO');
  assert.equal(crm[0].label,'TIDE CRM');
  assert.ok(studio[0].items.some(i=>i.section==='calendar'));
  assert.ok(studio[0].items.some(i=>i.section==='goals'));
  const paths=flatten(workspace).map(i=>i.href);
  assert.equal(new Set(paths).size,paths.length);
 }
});
test('Gui and Vital operations remain isolated and preserve WhatsApp',()=>{
 const gui=flatten('gui-nonato').map(i=>i.href);
 const vital=flatten('vital-decor').map(i=>i.href);
 assert.ok(gui.includes('/whatsapp'));
 assert.ok(vital.includes('/whatsapp'));
 assert.ok(gui.includes('/whatsapp/campanha'));
 assert.ok(!vital.includes('/whatsapp/campanha'));
 assert.ok(vital.includes('/crm/vital'));
 assert.ok(!gui.includes('/crm/vital'));
 assert.ok(vital.includes('/crm/vital/equipe'));
 assert.ok(vital.includes('/whatsapp/integracao-argo'));
 assert.ok(!gui.includes('/whatsapp/integracao-argo'));
 assert.ok(vital.includes('/conexoes/vital-decor'));
 assert.ok(!gui.includes('/conexoes/vital-decor'));
});
test('outdated creation tools are hidden in navigation, not deleted by navigation changes',()=>{
 const urls=flatten('gui-nonato').map(i=>i.href);
 assert.ok(!urls.includes('/radar'));
 assert.ok(!urls.includes('/criar-post'));
 assert.ok(!urls.includes('/conteudo/ia'));
});
test('search is accent-insensitive and respects the brand',()=>{
 assert.ok(searchNavigation('metricas','gui-nonato').some(i=>i.label==='Métricas do Instagram'));
 assert.ok(searchNavigation('conexoes vital','vital-decor').some(i=>i.href==='/conexoes/vital-decor'));
 assert.equal(searchNavigation('integracao argo','gui-nonato').length,0);
});
test('active section and CRM route matching do not leak across screens',()=>{
 const calendar=flatten('gui-nonato').find(i=>i.section==='calendar');
 assert.equal(matchesNavigation(calendar,'/','calendar'),true);
 assert.equal(matchesNavigation(calendar,'/','dashboard'),false);
 assert.equal(matchesNavigation(calendar,'/whatsapp','calendar'),false);
 const guiInbox=flatten('gui-nonato').find(i=>i.href==='/whatsapp');
 assert.equal(matchesNavigation(guiInbox,'/whatsapp'),true);
 assert.equal(matchesNavigation(guiInbox,'/whatsapp/gato'),false);
 const vitalCrm=flatten('vital-decor').find(i=>i.href==='/crm/vital');
 assert.equal(matchesNavigation(vitalCrm,'/crm/vital'),true);
 assert.equal(matchesNavigation(vitalCrm,'/crm/vital/equipe'),false);
});
