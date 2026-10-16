import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMentoriaDirectMessages, processMentoriaDirectKeywords } from '../app/api/instagram/flow-automations/direct.mjs';
import { GUI_WHATSAPP_URL } from '../app/lib/gui-whatsapp-cta.mjs';

const gui = '17841401155694295', vital='17841439121395170',sender='1200000011112222';
const input = (text,props={},account=gui)=>({
  object:'instagram',entry:[{id:account,messaging:[{
    sender:{id:sender},recipient:{id:account},timestamp:Date.now(),
    message:{mid:'mid.1',text,...props}
  }]}]
});

test('MENTORIA in Gui Direct matches the keyword, accents and case without false positives',()=>{
  assert.equal(extractMentoriaDirectMessages(input('MENTORIA')).length,1);
  assert.equal(extractMentoriaDirectMessages(input('oi! mentoria, por favor')).length,1);
  assert.equal(extractMentoriaDirectMessages(input('Mentoría')).length,1);
  assert.equal(extractMentoriaDirectMessages(input('mentoriado')).length,0);
  assert.equal(extractMentoriaDirectMessages(input('fornecedores')).length,0);
});
test('only inbound Gui text can trigger a Direct automation',()=>{
  assert.equal(extractMentoriaDirectMessages(input('MENTORIA',{},vital)).length,0);
  assert.equal(extractMentoriaDirectMessages(input('MENTORIA',{is_echo:true})).length,0);
  assert.equal(extractMentoriaDirectMessages(input('MENTORIA',{is_deleted:true})).length,0);
  assert.equal(extractMentoriaDirectMessages(input('MENTORIA',{quick_reply:{payload:'TPF:flow:button'}})).length,0);
  assert.equal(extractMentoriaDirectMessages(input('MENTORIA',{attachments:[{type:'image'}]})).length,0);
  const mismatch=input('MENTORIA');mismatch.entry[0].messaging[0].recipient.id=vital;
  assert.equal(extractMentoriaDirectMessages(mismatch).length,0);
  const old=input('MENTORIA');old.entry[0].messaging[0].timestamp=Date.now()-25*3600000;
  assert.equal(extractMentoriaDirectMessages(old).length,0);
});

function fakeDb(active=true){
  const claims=new Set(),statuses=[];
  const flow={id:'flow-mentoria-20260930-v2',name:'Mentoria',keyword:'MENTORIA',active,
    start:{id:'root',text:'Fala! Vi seu comentário no meu post 👊\n\nEu consigo te ajudar tanto se você está começando do zero quanto se já tem uma operação e quer crescer ainda mais.\n\nMe chama no WhatsApp pra eu entender melhor o seu momento e te ajudar a dar o próximo passo. 👇',
      whatsappButton:true,buttons:[],responseMode:'same'}};
  return {
    statuses,
    from(table){
      if(table==='instagram_flow_automations')return {select:()=>({order:()=>({limit:()=>({maybeSingle:async()=>({data:{flows:[flow]},error:null})})})})};
      if(table==='instagram_direct_keyword_deliveries')return {
        insert:(row)=>({select:()=>({maybeSingle:async()=>{
          const key=row.account_id+':'+row.message_id;
          if(claims.has(key))return {data:null,error:{code:'23505'}};
          claims.add(key);return {data:{message_id:row.message_id},error:null};
        }})}),
        update:(row)=>({eq:()=>({eq:async()=>{statuses.push(row);return {error:null};}})}),
      };
      throw new Error('Unexpected table '+table);
    }
  };
}
test('Direct replies reuse live Mentoria text and real WhatsApp button exactly once',async()=>{
  const originalFetch=globalThis.fetch,token=process.env.META_INSTAGRAM_ACCESS_TOKEN;
  const sent=[];
  globalThis.fetch=async(url,opts)=>{sent.push({url,body:JSON.parse(opts.body)});return{ok:true,status:200,json:async()=>({message_id:'mid.sent'})};};
  process.env.META_INSTAGRAM_ACCESS_TOKEN='integration-test-token';
  try {
    const db=fakeDb();
    assert.equal(await processMentoriaDirectKeywords(input('MENTORIA'),db),1);
    assert.equal(await processMentoriaDirectKeywords(input('MENTORIA'),db),0);
    assert.equal(sent.length,1);
    const msg=sent[0].body.message.attachment.payload;
    assert.match(msg.text,/Vi sua mensagem/);
    assert.doesNotMatch(msg.text,/Vi seu comentário/);
    assert.match(msg.text,/Me chama no WhatsApp pra eu entender melhor o seu momento/);
    assert.equal(msg.buttons.length,1);
    assert.equal(msg.buttons[0].type,'web_url');
    assert.equal(msg.buttons[0].url,GUI_WHATSAPP_URL);
    assert.equal(db.statuses[0].status,'sent');
  }finally{
    globalThis.fetch=originalFetch;
    if(token===undefined)delete process.env.META_INSTAGRAM_ACCESS_TOKEN;
    else process.env.META_INSTAGRAM_ACCESS_TOKEN=token;
  }
});
test('Disabled Mentoria never sends a Direct reply',async()=>{
  assert.equal(await processMentoriaDirectKeywords(input('MENTORIA'),fakeDb(false)),0);
});
