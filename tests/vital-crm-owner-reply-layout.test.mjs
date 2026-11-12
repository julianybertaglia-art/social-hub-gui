import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canReplyWithinWindow,WHATSAPP_REPLY_WINDOW_MS} from '../app/api/vital-whatsapp/conversations/inbox.mjs';
import {shouldSendOnEnter} from '../app/lib/vital-crm-keyboard.mjs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const live=source('app/api/crm/vital/live/route.js');
const reply=source('app/api/crm/vital/reply/route.js');
const ui=source('app/VitalCRMReal.js');
const css=source('app/vital-crm-real.module.css');

test('CRM replies are an independent feature, leaving transfers and status editing locked',()=>{
 assert.match(live,/readOnly:process\.env\.VITAL_CRM_WRITES_ENABLED!=='true'/);
 assert.match(live,/canReply:\['owner','agent'\]\.includes\(ctx\.access\.role\)/);
 assert.match(live,/&&process\.env\.VITAL_CRM_REPLY_ENABLED==='true'/);
 assert.doesNotMatch(live,/VITAL_CRM_REPLY_ENABLED==='true'\|\|/);
 assert.match(reply,/process\.env\.VITAL_CRM_REPLY_ENABLED!=='true'/);
 assert.doesNotMatch(reply,/VITAL_CRM_WRITES_ENABLED/);
 for(const p of ['app/api/crm/vital/status/route.js']) {
  assert.match(source(p),/VITAL_CRM_WRITES_ENABLED/);
  assert.doesNotMatch(source(p),/VITAL_CRM_REPLY_ENABLED/);
 }
 const transferSection=live.slice(live.indexOf('export async function PATCH(request)'));
 assert.match(transferSection,/VITAL_CRM_WRITES_ENABLED/);
 assert.doesNotMatch(transferSection,/VITAL_CRM_REPLY_ENABLED/);
});
test('authorized human reply preserves identity, queue grants, Argo guard, and 24h Meta window',()=>{
 assert.match(reply,/!\['owner','agent'\]\.includes\(access\.role\)/);
 assert.match(reply,/getVitalCrmMember\(request\)/);
 assert.match(reply,/\.eq\('workspace_id','vital-decor'\)/);
 assert.match(reply,/canReplyWithinWindow\(lastInbound\.data\?\.sent_at\)/);
 assert.match(reply,/legacy\.data\.assigned_to!=='tide'/);
 assert.match(reply,/reserveViviHandoff\(db,handoffArgs\)/);
 assert.match(reply,/!handoff\.ok/);
 assert.match(reply,/crm_vital_claim_reply_atomic/);
 assert.match(reply,/crm_vital_release_reply_atomic/);
 assert.match(reply,/Outro atendente está respondendo a esta conversa/);
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

test('Enter sends directly, but Shift+Enter, IME and shortcuts do not',()=>{
 const key={key:'Enter',shiftKey:false,ctrlKey:false,altKey:false,metaKey:false,repeat:false,nativeEvent:{isComposing:false}};
 assert.equal(shouldSendOnEnter(key),true);
 assert.equal(shouldSendOnEnter({...key,shiftKey:true}),false);
 assert.equal(shouldSendOnEnter({...key,repeat:true}),false);
 assert.equal(shouldSendOnEnter({...key,ctrlKey:true}),false);
 assert.equal(shouldSendOnEnter({...key,metaKey:true}),false);
 assert.equal(shouldSendOnEnter({...key,nativeEvent:{isComposing:true}}),false);
 assert.equal(shouldSendOnEnter({...key,nativeEvent:{keyCode:229}}),false);
 assert.equal(shouldSendOnEnter({...key,key:'a'}),false);
 assert.match(ui,/onKeyDown=\{handleReplyKeyDown\}/);
 assert.match(ui,/void reply\(event\)/);
 assert.doesNotMatch(ui,/requestSubmit\(\)/);
 assert.match(ui,/sendingRef\.current/);
});
