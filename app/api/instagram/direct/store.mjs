import { GUI_INSTAGRAM_ACCOUNT_ID as GUI_ACCOUNT } from '../../../lib/gui-instagram-connection.mjs';

export { GUI_ACCOUNT };
const VALID_ID = /^\d{5,40}$/;
const NORMALIZE = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const safeDate = (value) => {
  const num = Number(value);
  const ms = Number.isFinite(num) && num > 1000000000 ? (num > 1e12 ? num : num * 1000) : Date.parse(String(value || ''));
  return Number.isFinite(ms) && ms > 0 && ms < Date.now() + 300000 ? new Date(ms).toISOString() : new Date().toISOString();
};

export function classifyDirect(text) {
  const t = NORMALIZE(text);
  if (/\b(PARCERIA|COLAB|PUBLI|PERMUTA|INFLUENCIADOR|DIVULGACAO|AFILIAD|PATROCIN|PROPOSTA COMERCIAL|MIDIA KIT)\b/.test(t)) return 'partnership';
  if (/\b(JA VENDO|JA TENHO LOJA|SOU SELLER|TENHO OPERACAO|MEU FATURAMENTO|FATURO|MINHA CONTA NO MERCADO LIVRE|VENDO NO MERCADO LIVRE|VENDO NA SHOPEE|MINHA LOJA)\b/.test(t)) return 'sellers';
  if (/\b(QUERO COMECAR|ESTOU COMECANDO|SOU INICIANTE|NAO VENDO|NUNCA VENDI|COMO COMECAR|COMEÇAR DO ZERO|COMECO DO ZERO|SEM EXPERIENCIA)\b/.test(t)) return 'beginners';
  return 'unclassified';
}

export function keywordFromText(text, keywords = []) {
  const normalized = NORMALIZE(text);
  return keywords.find((word) => {
    const key = NORMALIZE(word).trim();
    if (!key) return false;
    const i = normalized.indexOf(key);
    if (i < 0) return false;
    const before = normalized[i - 1] || ' ';
    const after = normalized[i + key.length] || ' ';
    return !/[A-Z0-9]/.test(before) && !/[A-Z0-9]/.test(after);
  }) || null;
}

export async function configuredKeywords(db) {
  const {data,error} = await db.from('instagram_flow_automations').select('flows')
    .order('updated_at', {ascending:false}).limit(1).maybeSingle();
  if (error) return [];
  return (Array.isArray(data?.flows) ? data.flows : [])
    .filter((flow) => flow?.active && flow?.keyword)
    .map((flow) => String(flow.keyword).trim().toUpperCase()).slice(0,40);
}

async function profileDetails(senderId) {
  const token = process.env.META_INSTAGRAM_ACCESS_TOKEN;
  if (!token || !VALID_ID.test(senderId)) return {};
  for (const fields of ['username,name,is_business_follow_user','username,name']) {
    try {
      const url = new URL('https://graph.instagram.com/v26.0/' + senderId);
      url.searchParams.set('fields',fields);
      const res = await fetch(url,{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(4500)});
      if (!res.ok) continue;
      const user = await res.json();
      if (user?.error) continue;
      return {
        username: String(user.username||'').slice(0,120) || null,
        display_name: String(user.name||'').slice(0,150) || null,
        personal: user.is_business_follow_user === true
      };
    } catch {}
  }
  return {};
}

export async function saveDirectMessage(db, item, {keywords=[], enrich=true}={}) {
  const accountId=String(item.accountId||''), senderId=String(item.senderId||'');
  const messageId=String(item.messageId||'').slice(0,500);
  if(accountId!==GUI_ACCOUNT || !VALID_ID.test(senderId) || senderId===accountId || !messageId) return false;
  const direction=item.direction==='outbound'?'outbound':'inbound';
  const text=String(item.body||'').slice(0,12000);
  const when=safeDate(item.sentAt);
  const {data:existing,error:readError}=await db.from('instagram_direct_threads')
    .select('*').eq('account_id',accountId).eq('sender_id',senderId).maybeSingle();
  if(readError)throw readError;
  const details=!existing?.username && enrich ? await profileDetails(senderId) : {};
  if(!existing){
    const {error:insertError}=await db.from('instagram_direct_threads').upsert({
      account_id:accountId,sender_id:senderId,
      username:item.username || details.username || null,
      display_name:details.display_name || null,
      folder:details.personal?'personal':'spontaneous'
    },{onConflict:'account_id,sender_id',ignoreDuplicates:true});
    if(insertError)throw insertError;
  }
  const {error:messageError}=await db.from('instagram_direct_messages').upsert({
    account_id:accountId,sender_id:senderId,meta_message_id:messageId,
    direction,body:text,
    message_type:String(item.type||'text').slice(0,40),
    source:String(item.source||'webhook').slice(0,30),sent_at:when
  },{onConflict:'account_id,meta_message_id',ignoreDuplicates:true});
  if(messageError)throw messageError;
  const match=direction==='inbound'?keywordFromText(text,keywords):null;
  const inferredCategory=direction==='inbound'?classifyDirect(text):'unclassified';
  const newest=!existing?.last_message_at || new Date(when)>=new Date(existing.last_message_at);
  const patch={updated_at:new Date().toISOString()};
  if(!existing?.username && (item.username || details.username)) patch.username=String(item.username||details.username).slice(0,120);
  if(!existing?.display_name && details.display_name) patch.display_name=details.display_name;
  if(!existing?.folder_manual){
    if(details.personal) patch.folder='personal';
    else if(match && existing?.folder!=='personal') patch.folder='automation';
  }
  if(match && !existing?.automation_keyword)patch.automation_keyword=String(match).slice(0,50);
  if(inferredCategory!=='unclassified' && !existing?.category_manual && existing?.category==='unclassified') patch.category=inferredCategory;
  if(newest){
    patch.last_message_at=when;
    patch.last_excerpt=text.slice(0,230) || '['+String(item.type||'mensagem')+']';
    patch.needs_reply=direction==='inbound';
  }
  if(direction==='inbound' && (!existing?.last_inbound_at || new Date(when)>new Date(existing.last_inbound_at)))patch.last_inbound_at=when;
  const {error:updateError}=await db.from('instagram_direct_threads').update(patch)
    .eq('account_id',accountId).eq('sender_id',senderId);
  if(updateError)throw updateError;
  return true;
}

export function extractDirectEvents(payload) {
  if(payload?.object!=='instagram' || !Array.isArray(payload.entry))return [];
  return payload.entry.filter((entry)=>String(entry?.id||'')===GUI_ACCOUNT)
    .flatMap(entry=>(Array.isArray(entry.messaging)?entry.messaging:[]).flatMap((event)=>{
      const m=event?.message;
      if(!m?.mid || m.is_deleted || !event?.sender?.id || event.postback || event.reaction)return [];
      const echo=m.is_echo===true || String(event.sender.id)===GUI_ACCOUNT;
      const senderId=String(echo?event.recipient?.id:event.sender.id||'');
      if(!VALID_ID.test(senderId)||senderId===GUI_ACCOUNT)return [];
      const type=typeof m.text==='string'?'text':m.attachments?.[0]?.type||'attachment';
      const body=typeof m.text==='string'?m.text:'['+type+']';
      return [{accountId:GUI_ACCOUNT,senderId,messageId:String(m.mid),direction:echo?'outbound':'inbound',body,type,sentAt:event.timestamp,source:'webhook'}];
    }));
}

export async function saveWebhookDirect(payload, db) {
  const events=extractDirectEvents(payload).slice(0,70);
  if(!events.length)return 0;
  const keywords=await configuredKeywords(db);
  let saved=0;
  for(const event of events){
    try { if(await saveDirectMessage(db,event,{keywords})) saved++; }
    catch(err){ console.error('Instagram Direct: falha ao persistir evento',String(err?.code||'storage').slice(0,60)); }
  }
  return saved;
}
