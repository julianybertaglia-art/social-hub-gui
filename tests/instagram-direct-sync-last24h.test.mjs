import test from 'node:test';
import assert from 'node:assert/strict';
import {
  messageContent,normalizeMessage,cursorFromPage,isOlderThanWindow,isMissingText
} from '../app/api/instagram/direct/sync/helpers.mjs';
import {saveDirectMessage,GUI_ACCOUNT} from '../app/api/instagram/direct/store.mjs';

test('Meta message IDs alone do not become fabricated text',()=>{
  assert.equal(messageContent({id:'abc',created_time:'2026-10-21T12:00:00Z'}).body,'');
  assert.equal(isMissingText({id:'abc'}),true);
  assert.deepEqual(messageContent({message:'Já vendo no Mercado Livre'}),{body:'Já vendo no Mercado Livre',type:'text'});
  assert.deepEqual(messageContent({message:{text:'Me interessei pela mentoria'}}),{body:'Me interessei pela mentoria',type:'text'});
  assert.equal(messageContent({attachments:{data:[{type:'image'}]}}).body,'[Imagem enviada pelo Instagram]');
});
test('Meta message details determine sender and direction from the real account',()=>{
  const inbound=normalizeMessage({
    id:'m1',created_time:'2026-10-21T13:00:00+0000',
    from:{id:'123456789012'},to:{data:[{id:GUI_ACCOUNT}]},message:'Olá'
  });
  assert.equal(inbound.senderId,'123456789012');
  assert.equal(inbound.direction,'inbound');
  assert.equal(inbound.body,'Olá');
  const outbound=normalizeMessage({
    id:'m2',created_time:'2026-10-21T13:00:00Z',
    from:{id:GUI_ACCOUNT},to:{data:[{id:'123456789012'}]},message:'Oi!'
  });
  assert.equal(outbound.direction,'outbound');
  assert.equal(outbound.senderId,inbound.senderId);
  assert.equal(normalizeMessage({id:'m3',created_time:'2026-10-21T13:00:00Z'}),null);
});
test('pagination keeps the cursor and stops when conversations precede 24h',()=>{
  const cutoff=Date.parse('2026-10-20T12:00:00Z');
  assert.equal(isOlderThanWindow({updated_time:'2026-10-20T11:59:00Z'},cutoff),true);
  assert.equal(isOlderThanWindow({updated_time:'2026-10-20T13:00:00Z'},cutoff),false);
  assert.equal(isOlderThanWindow({},cutoff),false);
  assert.equal(cursorFromPage({paging:{cursors:{after:'cursor-2'}}}),'cursor-2');
  assert.equal(cursorFromPage({paging:{cursors:{}}}),null);
});
test('re-import repairs blank stored messages without discarding manual status',async()=>{
  const when='2026-10-21T13:00:00.000Z';
  const existingThread={
    id:'thread1',account_id:GUI_ACCOUNT,sender_id:'123456789012',folder:'automation',
    folder_manual:true,category:'sellers',category_manual:true,username:'seller',
    last_message_at:when,last_inbound_at:when,needs_reply:false
  };
  const stored={id:40,body:'',source:'meta-history'};
  const recorded=[];
  const db={
    from(table){
      return {
        select(){
          const state={};
          const chain={
            eq(k,v){state[k]=v;return chain;},
            async maybeSingle(){return {data:table==='instagram_direct_threads'?existingThread:stored,error:null};}
          };
          return chain;
        },
        update(value){
          recorded.push({table,value});
          const chain={eq(){return chain;},then(resolve){return Promise.resolve({error:null}).then(resolve);}};
          return chain;
        }
      };
    }
  };
  const ok=await saveDirectMessage(db,{
    accountId:GUI_ACCOUNT,senderId:'123456789012',messageId:'m1',
    direction:'inbound',body:'Texto real recuperado',type:'text',sentAt:when,source:'meta-history'
  },{enrich:false});
  assert.equal(ok,true);
  const update=recorded.find(item=>item.table==='instagram_direct_messages');
  assert.equal(update.value.body,'Texto real recuperado');
  const thread=recorded.find(item=>item.table==='instagram_direct_threads').value;
  assert.equal(thread.last_excerpt,'Texto real recuperado');
  assert.equal(Object.hasOwn(thread,'needs_reply'),false);
  assert.equal(Object.hasOwn(thread,'folder'),false);
});
