import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDirect,keywordFromText,extractDirectEvents,GUI_ACCOUNT } from '../app/api/instagram/direct/store.mjs';

test('classifies spontaneous Directs only when intent is explicit',()=>{
 assert.equal(classifyDirect('Sou iniciante e quero começar do zero'), 'beginners');
 assert.equal(classifyDirect('Já vendo no Mercado Livre e tenho operação'), 'sellers');
 assert.equal(classifyDirect('Gostaria de conversar sobre uma parceria'), 'partnership');
 assert.equal(classifyDirect('Oi Gui, tudo bem?'), 'unclassified');
});
test('automation keywords are grouped by configured trigger',()=>{
 assert.equal(keywordFromText('Quero MENTORIA, por favor',['MENTORIA','ATACADO']), 'MENTORIA');
 assert.equal(keywordFromText('Preciso de ATACADO',['MENTORIA','ATACADO']), 'ATACADO');
 assert.equal(keywordFromText('MEntOriAs',['MENTORIA']), null);
});
test('extracts only Gui Instagram messages and keeps WhatsApp/Vital fully outside',()=>{
 const valid={
  object:'instagram',entry:[
   {id:GUI_ACCOUNT,messaging:[
     {sender:{id:'123456789012'},recipient:{id:GUI_ACCOUNT},message:{mid:'inbound-1',text:'MENTORIA'},timestamp:1792575000000},
     {sender:{id:GUI_ACCOUNT},recipient:{id:'123456789012'},message:{mid:'outbound-1',text:'Olá!',is_echo:true},timestamp:1792575005000},
     {sender:{id:GUI_ACCOUNT},recipient:{id:'123456789012'},message:{mid:'outbound-2',text:'eco sem flag'},timestamp:1792575010000}
   ]},
   {id:'17841111111111111',messaging:[{sender:{id:'1234509876'},message:{mid:'vital-1',text:'Oi'}}]}
  ]
 };
 const extracted=extractDirectEvents(valid);
 assert.equal(extracted.length,3);
 assert.deepEqual(extracted.map(x=>x.direction),['inbound','outbound','outbound']);
 assert(extracted.every(e=>e.accountId===GUI_ACCOUNT&&e.senderId==='123456789012'));
 assert.equal(extractDirectEvents({object:'whatsapp_business_account',entry:valid.entry}).length,0);
});
