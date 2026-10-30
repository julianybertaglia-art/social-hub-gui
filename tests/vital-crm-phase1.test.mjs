import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {visibleNavGroups} from '../app/ui/navigation.js';
import {crmMemberAccess,canCrmAccess} from '../app/lib/crm-authorization.mjs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Vital CRM is only linked to Vital Decor, preserving the existing WhatsApp inbox',()=>{
 const vital=visibleNavGroups('vital-decor','crm')[0].items;
 const gui=visibleNavGroups('gui-nonato','crm')[0].items;
 assert.ok(vital.some(x=>x.href==='/crm/vital'));
 assert.ok(vital.some(x=>x.href==='/whatsapp'));
 assert.ok(!gui.some(x=>x.href==='/crm/vital'));
 assert.ok(gui.some(x=>x.href==='/whatsapp'));
});
test('Phase 1 denies staff from accessing real CRM messages regardless of delegated sectors',()=>{
 const live=source('app/api/crm/vital/live/route.js');
 assert.match(live,/auth\.access\.role!=='owner'/);
 assert.match(live,/readOnly:process\.env\.VITAL_CRM_WRITES_ENABLED!=='true'/);
 const access=source('app/lib/vital-crm-access.mjs');
 assert.match(access,/process\.env\.VITAL_CRM_STAFF_ENABLED!=='true'/);
 assert.equal(crmMemberAccess({role:'agent',status:'disabled',sectors:['pos_venda']}),null);
 assert.equal(canCrmAccess({role:'installer',status:'active',sectors:['pos_venda']},'read_conversation','pos_venda'),false);
});
test('Phase 1 blocks sending, transferring, resolution and team edits by default',()=>{
 for(const [p,method] of [
  ['app/api/crm/vital/live/route.js','PATCH'],
  ['app/api/crm/vital/reply/route.js','POST'],
  ['app/api/crm/vital/status/route.js','PATCH'],
  ['app/api/crm/vital/team/route.js','PATCH']
 ]) {
  const s=source(p);
  const methodStart=s.indexOf('export async function '+method+'(request)');
  assert.ok(methodStart>=0,p+' must have '+method);
  assert.ok(s.indexOf("process.env.VITAL_CRM_WRITES_ENABLED!=='true'",methodStart)>=0,p+' must deny writes without explicit QA release');
 }
 assert.match(source('app/VitalCRMReal.js'),/data\?\.readOnly/);
 assert.match(source('app/VitalCRMTeam.js'),/disabled=\{true\}/);
});
