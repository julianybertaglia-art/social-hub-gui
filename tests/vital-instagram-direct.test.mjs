import test from 'node:test';
import assert from 'node:assert/strict';
import { extractVitalDirectMessages, VITAL_WHATSAPP_LINK, VITAL_WELCOME_TEXT, VITAL_WHATSAPP_DISPLAY, VITAL_STORE_LINK } from '../app/api/vital-connections/instagram/direct.mjs';
import { readFileSync } from 'node:fs';

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

test('Vital Direct includes both official shopping and support destinations',()=>{
  assert.equal(VITAL_STORE_LINK,'https://vitaldecor.com.br');
  assert.equal(VITAL_WHATSAPP_DISPLAY,'(11) 96576-5247');
  assert.ok(VITAL_WHATSAPP_LINK.startsWith('https://wa.me/5511965765247'));
  assert.match(VITAL_WELCOME_TEXT,/n[aã]o realizamos atendimento pelo Direct/i);
  assert.match(VITAL_WELCOME_TEXT,/https:\/\/vitaldecor\.com\.br/);
  assert.match(VITAL_WELCOME_TEXT,/96576-5247/);
  assert.ok(VITAL_WELCOME_TEXT.length <= 640, 'button template text must stay under Meta limit');
});
test('Direct button template offers site and WhatsApp, fallback preserves WhatsApp URL',()=>{
  const src=readFileSync(new URL('../app/api/vital-connections/instagram/direct.mjs',import.meta.url),'utf8');
  assert.match(src,/url: VITAL_STORE_LINK, title: 'Comprar no site'/);
  assert.match(src,/url: VITAL_WHATSAPP_LINK, title: 'Falar no WhatsApp'/);
  assert.match(src,/text: VITAL_WELCOME_TEXT \+ '\\n\\nWhatsApp: ' \+ VITAL_WHATSAPP_LINK/);
  assert.match(src,/\.eq\('automatic_replies_enabled', true\)/);
  assert.match(src,/claim_vital_instagram_direct_reply/);
});
