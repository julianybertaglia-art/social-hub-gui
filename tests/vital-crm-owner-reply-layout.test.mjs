import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canReplyWithinWindow,WHATSAPP_REPLY_WINDOW_MS} from '../app/api/vital-whatsapp/conversations/inbox.mjs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const live=source('app/api/crm/vital/live/route.js');
const reply=source('app/api/crm/vital/reply/route.js');
const ui=source('app/VitalCRMReal.js');
const css=source('app/vital-crm-real.module.css');

test('CRM replies are an independent feature, leaving transfers and status editing locked',()=>{
 assert.match(live,/readOnly:process\.env\.VITAL_CRM_WRITES_ENABLED!=='true'/);
 assert.match(live,/canReply:process\.env\.VITAL_CRM_REPLY_ENABLED==='true'\|\|process\.env\.VITAL_CRM_WRITES_ENABLED==='true'/);
 assert.match(reply,/process\.env\.VITAL_CRM_REPLY_ENABLED!=='true'&&process\.env\.VITAL_CRM_WRITES_ENABLED!=='true'/);
 for(const p of ['app/api/crm/vital/status/route.js','app/api/crm/vital/team/route.js']) {
  assert.match(source(p),/VITAL_CRM_WRITES_ENABLED/);
  assert.doesNotMatch(source(p),/VITAL_CRM_REPLY_ENABLED/);
 }
 const transferSection=live.slice(live.indexOf('export async function PATCH(request)'));
 assert.match(transferSection,/VITAL_CRM_WRITES_ENABLED/);
 assert.doesNotMatch(transferSection,/VITAL_CRM_REPLY_ENABLED/);
});
test('owner-only reply preserves identity, permission, assigned Argo guard, and 24h Meta window',()=>{
 assert.match(reply,/access\.role!=='owner'/);
 assert.match(reply,/getVitalCrmMember\(request\)/);
 assert.match(reply,/\.eq\('workspace_id','vital-decor'\)/);
 assert.match(reply,/canReplyWithinWindow\(lastInbound\.data\?\.sent_at\)/);
 assert.match(reply,/legacy\.data\.assigned_to!=='tide'/);
 assert.match(reply,/stage:'await_human',human_handoff:true,manual_override:true/);
 assert.match(reply,/handOff|handoff\.error/);
});
test('only eligible contacts receive a chat composer; others see a clear explanation',()=>{
 assert.match(live,/replyWindowOpen:canReplyWithinWindow\(lastInboundAt\)/);
 assert.match(live,/replyBlockedByExternal:externalAssignment/);
 assert.match(ui,/const replyBlockReason=/);
 assert.match(ui,/data\?\.canReply/);
 assert.match(ui,/replyBlockedByExternal/);
 assert.match(ui,/replyWindowOpen/);
 assert.match(ui,/disabled=\{busy\|\|Boolean\(replyBlockReason\)\}/);
 assert.match(ui,/onSubmit=\{reply\}/);
});
test('chat stays resizable without the bulky sizing toolbar',()=>{
 for(const key of ['tideplace:crm-vital:split-width','tideplace:crm-vital:board-height',
  'className={css.splitter}','className={css.heightSplitter}',
  'onPointerMove={moveHeight}','onPointerMove={moveSplit}','onDoubleClick={resetBoardHeight}']){
  assert.ok(ui.includes(key),key);
 }
 for(const cssClass of ['.boardFrame','.board .messages','.threadBottom','.composeRow','.board .contacts']){
  assert.ok(css.includes(cssClass),cssClass);
 }
 for(const removed of ['Ajustar tamanho da conversa','id="vital-list-width"','id="vital-board-height"','Personalizar tamanho da central de atendimento']){
  assert.ok(!ui.includes(removed),removed);
 }
 assert.ok(!css.includes('.layoutToolbar'));
 assert.ok(!css.includes('.layoutControl input[type=range]'));
});
test('WhatsApp reply window is conservative',()=>{
 const now=Date.now();
 assert.equal(canReplyWithinWindow(new Date(now-5*60*1000).toISOString(),now),true);
 assert.equal(canReplyWithinWindow(new Date(now-WHATSAPP_REPLY_WINDOW_MS).toISOString(),now),false);
 assert.equal(canReplyWithinWindow(null,now),false);
});
