// Read-only aggregation for the Vital Decor store marketing overview.
// Never return customer or contact fields. Missing/incomplete data is not zero.
const digits=value=>typeof value==='string'&&/^\d{3,20}$/.test(value);
const finite=value=>{
  if(typeof value!=='string'&&typeof value!=='number')return null;
  if(String(value).trim()==='')return null;
  const parsed=Number(value);
  return Number.isFinite(parsed)&&parsed>=0?parsed:null;
};
const safeName=value=>typeof value==='string'?value.slice(0,80):'Produto sem nome';
const money=value=>Math.round((value+Number.EPSILON)*100)/100;

export function summarizeStoreOrders(orders,{period='Últimos 30 dias completos',start,end}={}){
  let paidOrders=0,revenue=0,unknownTotals=0;
  const items=new Map();
  for(const order of orders){
    const created=String(order?.created_at||'').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(created)||created<start||created>end)continue;
    if(String(order?.payment_status||'')!=='paid'||String(order?.status||'')==='cancelled')continue;
    const total=finite(order?.total);
    paidOrders+=1;
    if(total===null)unknownTotals+=1;else revenue+=total;
    if(Array.isArray(order?.products)){
      for(const product of order.products){
        const key=String(product?.product_id||product?.id||safeName(product?.name)).slice(0,80);
        const qty=finite(product?.quantity);
        if(qty===null)continue;
        const prev=items.get(key)||{name:safeName(product?.name),quantity:0};
        prev.quantity+=qty;items.set(key,prev);
      }
    }
  }
  return {period,start,end,paidOrders,revenue:unknownTotals?null:money(revenue),
    averageTicket:unknownTotals||!paidOrders?null:money(revenue/paidOrders),
    currency:'BRL',topProducts:[...items.values()].sort((a,b)=>b.quantity-a.quantity).slice(0,5)};
}
function completedDays(now){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',
    month:'2-digit',day:'2-digit'}).formatToParts(now);
  const value=name=>parts.find(part=>part.type===name)?.value;
  const local=`${value('year')}-${value('month')}-${value('day')}`;
  // Timezone is deliberate: show complete Brazilian calendar days (exclude today).
  const day=new Date(local+'T12:00:00Z');
  if(Number.isNaN(day.getTime()))throw Error('date_invalid');
  const end=new Date(day.getTime()-86400000).toISOString().slice(0,10);
  const start=new Date(day.getTime()-30*86400000).toISOString().slice(0,10);
  return {start,end};
}
export async function readVitalStoreSummary(env=process.env,fetcher=fetch,now=new Date()){
  const storeId=String(env.NUVEMSHOP_VITAL_STORE_ID||'');
  const token=env.NUVEMSHOP_VITAL_ACCESS_TOKEN;
  if(!digits(storeId)||!token)return {status:'not_configured'};
  const {start,end}=completedDays(now);
  const collected=[];
  try{
    // Use a bounded read: if there are more than 1,000 orders, never present partial
    // totals as a complete dashboard.
    const limit=200,maxPages=5;
    for(let page=1;page<=maxPages;page++){
      const url=new URL('https://api.nuvemshop.com.br/2025-03/'+storeId+'/orders');
      url.searchParams.set('page',String(page));
      url.searchParams.set('per_page',String(limit));
      url.searchParams.set('created_at_min',start+'T00:00:00-03:00');
      url.searchParams.set('created_at_max',end+'T23:59:59-03:00');
      const response=await fetcher(url.toString(),{method:'GET',
        headers:{Authorization:'Bearer '+token,'User-Agent':env.NUVEMSHOP_VITAL_USER_AGENT||'TidePlace Vital Decor (read-only)',
          Accept:'application/json'},signal:AbortSignal.timeout(15000),cache:'no-store'});
      if(!response.ok){
        // Only expose HTTP status classes; never log headers, tokens, body or customer data.
        const issue=response.status===401?'auth_invalid':response.status===403?'orders_permission':
          response.status===404?'store_not_found':response.status===429?'rate_limited':'api_error';
        console.error('[vital-store-summary] Nuvemshop request failed',response.status,issue);
        return {status:'unavailable',issue};
      }
      const payload=await response.json();
      if(!Array.isArray(payload)){
        console.error('[vital-store-summary] Unexpected Nuvemshop response shape');
        return {status:'unavailable',issue:'response_format'};
      }
      collected.push(...payload);
      if(payload.length<limit){
        return {status:'ready',data:{...summarizeStoreOrders(collected,{start,end}),
          fetchedAt:now.toISOString(),scope:'Pedidos criados no período e pagos; valor total dos pedidos, não receita líquida.'}};
      }
    }
    return {status:'incomplete'};
  }catch(error){
    console.error('[vital-store-summary] Request could not be completed',error?.name||'UnknownError');
    return {status:'unavailable',issue:'network_error'};
  }
}
