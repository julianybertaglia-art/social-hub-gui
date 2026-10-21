import { GUI_INSTAGRAM_ACCOUNT_ID } from '../../../../lib/gui-instagram-connection.mjs';

const ID=/^\d{5,50}$/;
const clean=(value)=>typeof value==='string'?value.trim():'';
const actor=(value)=>{
  if(typeof value==='string')return value;
  if(Array.isArray(value))return actor(value[0]);
  if(Array.isArray(value?.data))return actor(value.data[0]);
  return String(value?.id||'');
};

export function messageContent(msg) {
  const plain=[msg?.message,msg?.message?.text,msg?.text,msg?.attachment?.payload?.text,
    msg?.attachments?.data?.[0]?.payload?.text,msg?.attachments?.[0]?.payload?.text]
    .find(v=>typeof v==='string'&&v.trim());
  if(plain)return {body:plain.trim(),type:'text'};
  const attachment=msg?.attachments?.data?.[0]||msg?.attachments?.[0]||msg?.attachment;
  const rawType=String(attachment?.type||'').toLowerCase();
  if(rawType==='image')return {body:'[Imagem enviada pelo Instagram]',type:'image'};
  if(rawType==='video')return {body:'[Vídeo enviado pelo Instagram]',type:'video'};
  if(rawType==='audio')return {body:'[Áudio enviado pelo Instagram]',type:'audio'};
  if(rawType==='file')return {body:'[Arquivo enviado pelo Instagram]',type:'file'};
  if(msg?.shares||msg?.share)return {body:'[Publicação compartilhada]',type:'share'};
  if(msg?.story)return {body:'[Story compartilhado]',type:'story'};
  if(rawType)return {body:'[Mídia recebida: '+rawType.slice(0,30)+']',type:'attachment'};
  return {body:'',type:'text'};
}

export function normalizeMessage(msg,conversationFallback=null){
  const from=actor(msg?.from)||actor(conversationFallback?.from);
  const to=actor(msg?.to)||actor(conversationFallback?.to);
  const outgoing=from===GUI_INSTAGRAM_ACCOUNT_ID;
  const senderId=outgoing?to:from;
  if(!ID.test(senderId)||senderId===GUI_INSTAGRAM_ACCOUNT_ID||!clean(msg?.id))return null;
  const sentAt=msg?.created_time||msg?.timestamp;
  const time=Date.parse(String(sentAt||''));
  if(!Number.isFinite(time)||time<=0||time>Date.now()+300000)return null;
  const {body,type}=messageContent(msg);
  return {
    accountId:GUI_INSTAGRAM_ACCOUNT_ID,senderId,messageId:String(msg.id),
    direction:outgoing?'outbound':'inbound',
    username:outgoing?undefined:msg.from?.username,
    body,type,sentAt:new Date(time).toISOString(),source:'meta-history'
  };
}

export function cursorFromPage(page) {
  const cursor=page?.paging?.cursors?.after;
  return typeof cursor==='string'&&cursor.length<700?cursor:null;
}

export function isOlderThanWindow(conversation,cutoff) {
  const raw=conversation?.updated_time;
  if(!raw)return false;
  const date=Date.parse(String(raw));
  return Number.isFinite(date)&&date>0&&date<cutoff;
}

export function isMissingText(msg){
  return !messageContent(msg).body;
}
