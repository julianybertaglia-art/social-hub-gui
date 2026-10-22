import { GUI_INSTAGRAM_ID } from '../../vital-connections/helpers.mjs';
import { loadLatestFlows, sendNodeToRecipient } from './service.js';

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
const MENTORIA_KEYWORD = 'MENTORIA';
const DIRECT_RECEIPTS = 'instagram_direct_keyword_deliveries';

function extractKeywordDirectMessages(payload, keyword) {
  if (payload?.object !== 'instagram' || !Array.isArray(payload.entry)) return [];
  return payload.entry.flatMap(entry => {
    const accountId = String(entry?.id || '');
    if (accountId !== GUI_INSTAGRAM_ID || !Array.isArray(entry.messaging)) return [];
    return entry.messaging.flatMap(event => {
      const message = event?.message;
      const senderId = String(event?.sender?.id || '');
      const recipientId = String(event?.recipient?.id || '');
      const text = normalize(message?.text);
      const messageId = String(message?.mid || '');
      if(!/^\d{5,40}$/.test(senderId) || senderId === accountId ||
         (recipientId && recipientId !== accountId) ||
         !messageId || messageId.length > 500 ||
         !message || typeof message.text !== 'string' ||
         message.is_echo || message.is_deleted || message.is_unsupported ||
         message.quick_reply || event.postback ||
         event.reaction || message.attachments ||
         !(new RegExp('(^|[^A-Z0-9])' + keyword + '(?=$|[^A-Z0-9])')).test(text)) return [];
      const timestamp=Number(event.timestamp);
      // Old notification replays must not message someone out of the blue.
      if(Number.isFinite(timestamp) && timestamp>0 &&
        (timestamp<Date.now()-24*60*60*1000 || timestamp>Date.now()+5*60*1000))return [];
      return [{ accountId,senderId,messageId,keyword }];
    });
  });
}

export const extractMentoriaDirectMessages = payload => extractKeywordDirectMessages(payload, MENTORIA_KEYWORD);
export const extractConsultoriaDirectMessages = payload => extractKeywordDirectMessages(payload, 'CONSULTORIA');

async function claimDirectMessage(db,event,flow) {
  // Primary key (account_id,message_id) makes a Meta retry a no-op.
  // A network timeout after sending may be ambiguous: never replay automatically.
  const {data,error}=await db.from(DIRECT_RECEIPTS).insert({
    account_id:event.accountId,
    message_id:event.messageId,
    sender_id:event.senderId,
    flow_id:flow.id,
    keyword:flow.keyword,
    status:'processing'
  }).select('message_id').maybeSingle();
  if(error){
    if(error.code==='23505')return false;
    throw new Error('Não foi possível registrar o Direct antes de responder.');
  }
  return Boolean(data);
}

async function updateReceipt(db,event,status,errorMessage=null) {
  const {error}=await db.from(DIRECT_RECEIPTS)
    .update({status,error_message:errorMessage,updated_at:new Date().toISOString()})
    .eq('account_id',event.accountId).eq('message_id',event.messageId);
  if(error)console.error('TIDEPLACE:DIRECT: não foi possível atualizar o status da resposta.');
}

async function processKeywordDirect(payload,db,keyword){
  const events=extractKeywordDirectMessages(payload,keyword);
  if(!events.length)return 0;
  const flows=(await loadLatestFlows(db)).filter(flow=>flow.active);
  // The exact configured comment flow is the source of truth for the Direct.
  const flow=flows.find(f=>normalize(f.keyword)===keyword);
  if(!flow)return 0;
  let sent=0;
  for(const event of events){
    const claimed=await claimDirectMessage(db,event,flow);
    if(!claimed)continue;
    try{
      // Same saved start text and WhatsApp CTA as when the follower comments.
      // Do not send a public comment reply for a private incoming message.
      const directStart={...flow.start,text:String(flow.start.text||'').replace('Vi seu comentário no meu post','Vi sua mensagem')};
      const result=await sendNodeToRecipient(db,event.accountId,event.senderId,flow,directStart,{includeAudio:false});
      if(!result?.message_id)throw new Error('Meta não confirmou o envio da resposta.');
      await updateReceipt(db,event,'sent');
      sent++;
    }catch(error){
      // Never auto-retry. The Meta may have accepted a message before timing out.
      await updateReceipt(db,event,'failed',String(error?.message||'Falha no envio.').slice(0,300));
      console.error('TIDEPLACE:DIRECT: falha ao enviar resposta de palavra-chave.');
    }
  }
  return sent;
}

export const processMentoriaDirectKeywords = (payload,db) => processKeywordDirect(payload,db,MENTORIA_KEYWORD);
export const processConsultoriaDirectKeywords = (payload,db) => processKeywordDirect(payload,db,'CONSULTORIA');
