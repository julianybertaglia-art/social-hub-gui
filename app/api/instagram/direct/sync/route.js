import { authorize } from '../../../vital-connections/service';
import { verifiedGuiInstagram } from '../../../../lib/gui-instagram-meta.mjs';
import { GUI_ACCOUNT, saveDirectMessage, configuredKeywords } from '../store.mjs';
import { cursorFromPage, isOlderThanWindow, isMissingText, normalizeMessage } from './helpers.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;

const headers={'Cache-Control':'private, no-store',Vary:'Authorization'};
const BASE='https://graph.instagram.com/v26.0/';
const PAGE_SIZE=12;
const MESSAGES_PER_CONVERSATION=20;
const LOOKBACK_MS=24*60*60*1000;

function publicFailure(error){
  const status=error?.status||502;
  return Response.json({
    error:status===409?'A credencial atual do Instagram não permite consultar o histórico.':(
      status===429?'A Meta limitou as consultas por alguns instantes. Tente novamente em breve.':
      'Não foi possível concluir a consulta na Meta. Tente novamente.')
  },{status,headers});
}

async function fetchMeta(path,params,token){
  const url=new URL(BASE+path);
  Object.entries(params||{}).forEach(([key,value])=>url.searchParams.set(key,String(value)));
  const response=await fetch(url,{
    headers:{Authorization:'Bearer '+token},
    cache:'no-store',
    signal:AbortSignal.timeout(12500)
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok||result.error){
    const code=response.status===429||result.error?.code===4||result.error?.code===17?429:502;
    const error=new Error('Meta Graph request failed');
    error.status=code;
    throw error;
  }
  return result;
}

async function fullMessage(metaItem,token){
  const id=String(metaItem?.id||'');
  if(!id||id.length>500)return null;
  const basic=normalizeMessage(metaItem);
  // The conversation's messages edge frequently returns only message IDs.
  // Always query the message itself if its body or sender is missing.
  if(basic && !isMissingText(metaItem))return basic;
  let details=null;
  try{
    details=await fetchMeta(encodeURIComponent(id),{fields:'id,created_time,from,to,message,attachments,shares,story'},token);
  }catch(error){
    if(error.status===429)throw error;
    try{details=await fetchMeta(encodeURIComponent(id),{fields:'id,created_time,from,to,message'},token);}
    catch(second){if(second.status===429)throw second;}
  }
  const resolved=details?normalizeMessage({
    ...metaItem,...details,from:details.from||metaItem.from,to:details.to||metaItem.to
  }):null;
  if(resolved)return resolved;
  // Do not add fake, empty messages when details are unavailable.
  return basic && !isMissingText(metaItem)?basic:null;
}

async function readMessages(conversation,token){
  const id=String(conversation?.id||'');
  if(!id||id.length>500)return [];
  // This edge returns at most the latest messages allowed by Meta.
  let raw;
  try{
    raw=await fetchMeta(encodeURIComponent(id),{
      fields:'messages.limit('+MESSAGES_PER_CONVERSATION+')'
    },token);
  }catch(error){
    if(error.status===429)throw error;
    raw=await fetchMeta(encodeURIComponent(id),{fields:'messages'},token);
  }
  return (Array.isArray(raw?.messages?.data)?raw.messages.data:[]).slice(0,MESSAGES_PER_CONVERSATION);
}

async function processConversation(conversation,{db,token,keywords,cutoff}){
  let checked=0,saved=0,unavailable=0,failures=0;
  const raw=await readMessages(conversation,token);
  // Meta returns the latest messages first, but do not assume every
  // conversation has complete metadata on the nested edge.
  for(let start=0;start<raw.length;start+=5){
    const batch=raw.slice(start,start+5);
    const settled=await Promise.allSettled(batch.map(item=>fullMessage(item,token)));
    for(let index=0;index<settled.length;index++){
      const item=settled[index];
      if(item.status==='rejected'){
        if(item.reason?.status===429)throw item.reason;
        failures++;continue;
      }
      const m=item.value;
      if(!m){unavailable++;continue;}
      const date=new Date(m.sentAt).getTime();
      if(date<cutoff)continue;
      checked++;
      if(!m.body){unavailable++;continue;}
      try{
        if(await saveDirectMessage(db,m,{keywords,enrich:false}))saved++;
      }catch{failures++;}
    }
  }
  return {checked,saved,unavailable,failures};
}

export async function POST(request){
  try{
    const origin=request.headers.get('origin');
    if(origin&&origin!==new URL(request.url).origin)
      return Response.json({error:'Origem inválida.'},{status:403,headers});
    const {db}=await authorize(request);
    const payload=await request.json().catch(()=>({}));
    const cursor=typeof payload?.cursor==='string'?payload.cursor:'';
    if(cursor.length>650)return Response.json({error:'Página inválida.'},{status:400,headers});
    const connection=await verifiedGuiInstagram();
    if(connection.host!=='graph.instagram.com'){
      const error=new Error('Unsupported token host');error.status=409;throw error;
    }
    const cutoff=Date.now()-LOOKBACK_MS;
    const page=await fetchMeta(GUI_ACCOUNT+'/conversations',{
      limit:PAGE_SIZE,...(cursor?{after:cursor}:{})
    },connection.token);
    const conversations=Array.isArray(page.data)?page.data:[];
    const toProcess=[];
    let pastWindow=false;
    for(const conversation of conversations){
      if(isOlderThanWindow(conversation,cutoff)){pastWindow=true;break;}
      toProcess.push(conversation);
    }
    const keywords=await configuredKeywords(db);
    const total={checked:0,saved:0,unavailable:0,failures:0};
    // Bounded parallelism keeps this request under the Vercel time limit.
    for(let i=0;i<toProcess.length;i+=3){
      const batch=await Promise.allSettled(toProcess.slice(i,i+3).map(conv=>
        processConversation(conv,{db,token:connection.token,keywords,cutoff})
      ));
      for(const result of batch){
        if(result.status==='rejected'){
          if(result.reason?.status===429)throw result.reason;
          total.failures++;continue;
        }
        for(const key of Object.keys(total))total[key]+=result.value[key];
      }
    }
    const nextCursor=!pastWindow&&conversations.length?cursorFromPage(page):null;
    return Response.json({
      ok:true,reviewed:toProcess.length,...total,nextCursor,done:!nextCursor,
      note:'Somente mensagens disponibilizadas pela Meta são importadas. Algumas mídias e conversas podem ter restrições.'
    },{headers});
  }catch(error){return publicFailure(error);}
}
