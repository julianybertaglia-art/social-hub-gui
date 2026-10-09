import test from 'node:test';
import assert from 'node:assert/strict';
import { extractVitalDirectMessages, VITAL_WHATSAPP_LINK, VITAL_WELCOME_TEXT } from '../app/api/vital-connections/instagram/direct.mjs';

const vital='17841439121395170';
const gui='17841401155694295';
const msg=(account, message, extras={})=>({object:'instagram',entry:[{id:account,messaging:[{sender:{id:'1234567890123'},recipient:{id:account},message,...extras}]}]});

test('Vital Decor plain inbound Direct is eligible',()=>{
  assert.deepEqual(extractVitalDirectMessages(msg(vital,{mid:'m1',text:'Oi'})),[{accountId:vital,senderId:'1234567890123',messageId:'m1'}]);
});
test('Gui Direct is never processed by Vital handler',()=>{
  assert.equal(extractVitalDirectMessages(msg(gui,{mid:'m2',text:'Oi'})).length,0);
});
test('ignores echoes, automation quick replies, postbacks and comment notifications',()=>{
  assert.equal(extractVitalDirectMessages(msg(vital,{mid:'m3',text:'Oi',is_echo:true})).length,0);
  assert.equal(extractVitalDirectMessages(msg(vital,{mid:'m4',quick_reply:{payload:'TPF:flow:button'}})).length,0);
  assert.equal(extractVitalDirectMessages(msg(vital,{mid:'m5'},{postback:{payload:'TPF:a:b'}})).length,0);
  assert.equal(extractVitalDirectMessages({object:'instagram',entry:[{id:vital,changes:[{field:'comments',value:{text:'OI'}}]}]}).length,0);
});
test('redirects only to the verified Vital Decor WhatsApp',()=>{
  assert.ok(VITAL_WHATSAPP_LINK.startsWith('https://wa.me/5511965765247?text='));
  assert.match(VITAL_WELCOME_TEXT,/Vital Decor/);
});
