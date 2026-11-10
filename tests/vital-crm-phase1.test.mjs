import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {visibleNavGroups} from '../app/ui/navigation.js';
import {crmMemberAccess,canCrmAccess} from '../app/lib/crm-authorization.mjs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Vital CRM has a single navigation entry while preserving the legacy WhatsApp route',()=>{
 const vital=visibleNavGroups('vital-decor','crm')[0].items;
 const gui=visibleNavGroups('gui-nonato','crm')[0].items;
 assert.ok(vital.some(x=>x.href==='/crm/vital'));
 assert.ok(!vital.some(x=>x.href==='/whatsapp'));
 assert.ok(source('app/HubFrame.js').includes("pathname === '/whatsapp'"));
 assert.ok(!gui.some(x=>x.href==='/crm/vital'));
 assert.ok(gui.some(x=>x.href==='/whatsapp'));
});
test('staff CRM access is server-gated and each list/detail path applies persisted queue grants',()=>{
 const live=source('app/api/crm/vital/live/route.js');
 assert.match(live,/getVitalCrmMember\(request\)/);
 assert.match(live,/canAccessVitalQueue\(ctx\.access\.role,ctx\.allowed,queue\)/);
 assert.match(live,/Conversa não encontrada nas filas autorizadas/);
 assert.match(live,/readOnly:process\.env\.VITAL_CRM_WRITES_ENABLED!=='true'/);
 const access=source('app/lib/vital-crm-access.mjs');
 assert.match(access,/process\.env\.VITAL_CRM_STAFF_ENABLED==='true'/);
 assert.equal(crmMemberAccess({role:'agent',status:'disabled',sectors:['pos_venda']}),null);
 assert.equal(canCrmAccess({role:'installer',status:'active',sectors:['pos_venda']},'read_conversation','pos_venda'),false);
});
test('reply, transfer and status writes remain behind explicit release flags',()=>{
 for(const [p,method,flag] of [
  ['app/api/crm/vital/live/route.js','PATCH','VITAL_CRM_WRITES_ENABLED'],
  ['app/api/crm/vital/reply/route.js','POST','VITAL_CRM_REPLY_ENABLED'],
  ['app/api/crm/vital/status/route.js','PATCH','VITAL_CRM_WRITES_ENABLED']
 ]) {
  const s=source(p);
  const methodStart=s.indexOf('export async function '+method+'(request)');
  assert.ok(methodStart>=0,p+' must have '+method);
  assert.ok(s.indexOf("process.env."+flag+"!=='true'",methodStart)>=0,p+' must deny writes without the dedicated release flag');
 }
 assert.doesNotMatch(source('app/api/crm/vital/reply/route.js'),/VITAL_CRM_WRITES_ENABLED/);
 assert.match(source('app/VitalCRMReal.js'),/data\?\.readOnly/);
 const team=source('app/api/crm/vital/team/route.js');
 assert.match(team,/invitationSent:false,accessGranted:false/);
 assert.match(team,/status!=='draft'/);
 assert.match(source('app/VitalCRMTeam.js'),/Nenhum funcionário recebeu acesso ainda/);
});
