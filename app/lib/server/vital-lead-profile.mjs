import {canonicalPhone,samePhone,mapLeadOrder,mapLeadCheckout,classifyLead,recommendationForLead,timingForLead} from '../vital-lead-intelligence.mjs';

const STORE_URL='https://api.nuvemshop.com.br/2025-03/';
const validStore=id=>/^\d{3,20}$/.test(String(id||''));
const abort=()=>AbortSignal.timeout(12500);
const DAY=86400000;
async function getCollection({kind,storeId,token,phone,env,fetcher,now,days,limitPages}){
 const rows=[],perPage=200;
 const start=new Date(now.getTime()-days*DAY).toISOString().slice(0,10);
 for(let page=1;page<=limitPages;page++){
  const url=new URL(STORE_URL+storeId+'/'+kind);
  url.searchParams.set('page',String(page));
  url.searchParams.set('per_page',String(perPage));
  url.searchParams.set('created_at_min',start+'T00:00:00-03:00');
  const response=await fetcher(url.toString(),{method:'GET',headers:{
   Authorization:'Bearer '+token,'User-Agent':env.NUVEMSHOP_VITAL_USER_AGENT||'TidePlace Vital CRM (read-only)',
   Accept:'application/json'},signal:abort(),cache:'no-store'});
  if(!response.ok){
   const issue=response.status===401?'auth_invalid':response.status===403?'permission_denied':
     response.status===429?'rate_limited':response.status===404?'not_found':'api_error';
   return {state:'unavailable',issue,periodDays:days,items:[]};
  }
  const payload=await response.json();
  if(!Array.isArray(payload))return {state:'unavailable',issue:'invalid_response',periodDays:days,items:[]};
  for(const x of payload){
   // Contact identity only. Never match name or a different shipping recipient.
   if(samePhone(x?.contact_phone,phone)||samePhone(x?.customer?.phone,phone))
    rows.push(kind==='orders'?mapLeadOrder(x):mapLeadCheckout(x));
  }
  if(payload.length<perPage)return {state:'ready',periodDays:days,items:rows.sort((a,b)=>Date.parse(b.at||'')-Date.parse(a.at||''))};
 }
 return {state:'incomplete',periodDays:days,items:rows.sort((a,b)=>Date.parse(b.at||'')-Date.parse(a.at||''))};
}
export async function readVitalLeadProfile({phone,siteLinkNoReturn=false,replyWindowOpen=false,
 env=process.env,fetcher=fetch,now=new Date()}={}){
 if(!canonicalPhone(phone))return {state:'invalid_phone'};
 const storeId=String(env.NUVEMSHOP_VITAL_STORE_ID||''),token=env.NUVEMSHOP_VITAL_ACCESS_TOKEN;
 if(!validStore(storeId)||!token)return {state:'not_configured',orders:[],checkouts:[],
  lead:classifyLead({siteLinkNoReturn}),recommendation:recommendationForLead({siteLinkNoReturn,replyWindowOpen}),timing:timingForLead({siteLinkNoReturn,replyWindowOpen})};
 const [o,c]=await Promise.allSettled([
  getCollection({kind:'orders',storeId,token,phone,env,fetcher,now,days:365,limitPages:5}),
  getCollection({kind:'checkouts',storeId,token,phone,env,fetcher,now,days:30,limitPages:3})
 ]);
 const orders=o.status==='fulfilled'?o.value:{state:'unavailable',issue:'network_error',items:[],periodDays:365};
 const checkouts=c.status==='fulfilled'?c.value:{state:'unavailable',issue:'network_error',items:[],periodDays:30};
 const sourcesReady=orders.state==='ready'&&checkouts.state==='ready';
 const currentCheckouts=checkouts.items;
 return {state:sourcesReady?'ready':'partial',source:{orders:{state:orders.state,issue:orders.issue||null,periodDays:365},
   checkouts:{state:checkouts.state,issue:checkouts.issue||null,periodDays:30}},
   orders:orders.items.slice(0,20),checkouts:currentCheckouts.slice(0,10),
   lead:classifyLead({orders:orders.items,checkouts:currentCheckouts,siteLinkNoReturn,sourcesReady}),
   recommendation:recommendationForLead({orders:orders.items,checkouts:currentCheckouts,siteLinkNoReturn,replyWindowOpen,sourcesReady}),
   timing:timingForLead({orders:orders.items,checkouts:currentCheckouts,siteLinkNoReturn,replyWindowOpen}),
   checkedAt:now.toISOString()};
}
