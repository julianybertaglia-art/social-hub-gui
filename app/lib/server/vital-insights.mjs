import {createSign} from 'node:crypto';

const positive=value=>{const n=Number(value);return Number.isFinite(n)&&n>=0?n:null;};
export function summarizeGa4(report) {
  const names=(report?.metricHeaders||[]).map(x=>x.name);
  const values=report?.rows?.[0]?.metricValues||[];
  const byName=name=>{const at=names.indexOf(name);return at<0?null:positive(values[at]?.value);};
  return {period:'Últimos 30 dias completos',sessions:byName('sessions'),
    users:byName('totalUsers'),pageViews:byName('screenPageViews'),
    purchases:byName('ecommercePurchases'),purchaseRevenue:byName('purchaseRevenue')};
}
export function summarizeClarity(data) {
  const traffic=Array.isArray(data)?data.find(x=>x?.metricName==='Traffic'):null;
  const rows=Array.isArray(traffic?.information)?traffic.information:[];
  if(!rows.length) return null;
  const sum=key=>rows.reduce((a,r)=>a+(positive(r?.[key])||0),0);
  return {period:'Últimas 72 horas (UTC)',sessions:sum('totalSessionCount'),
    botSessions:sum('totalBotSessionCount'),
    devices:rows.filter(r=>r?.Device && positive(r.totalSessionCount)!==null)
       .map(r=>({device:String(r.Device).slice(0,50),sessions:positive(r.totalSessionCount)}))
       .sort((a,b)=>b.sessions-a.sessions).slice(0,5)};
}
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
async function googleAccessToken({email,privateKey,fetcher=fetch,now=Date.now}){
  const timestamp=Math.floor(now()/1000);
  const header=encode({alg:'RS256',typ:'JWT'});
  const claims=encode({iss:email,scope:'https://www.googleapis.com/auth/analytics.readonly',
    aud:'https://oauth2.googleapis.com/token',iat:timestamp,exp:timestamp+3000});
  const unsigned=header+'.'+claims;
  const signer=createSign('RSA-SHA256');signer.update(unsigned);signer.end();
  const assertion=unsigned+'.'+signer.sign(privateKey.replace(/\\n/g,'\n')).toString('base64url');
  const response=await fetcher('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),
    signal:AbortSignal.timeout(10000),cache:'no-store'});
  if(!response.ok)throw Error('ga4_token');
  const payload=await response.json();
  if(typeof payload?.access_token!=='string')throw Error('ga4_token');
  return payload.access_token;
}
export async function readGa4(env=process.env,fetcher=fetch){
  const property=env.VITAL_GA4_PROPERTY_ID;
  if(!/^\d{5,20}$/.test(property||'')||
     !env.VITAL_GA4_SERVICE_EMAIL||!env.VITAL_GA4_PRIVATE_KEY)
    return {status:'not_configured'};
  try{
    const token=await googleAccessToken({email:env.VITAL_GA4_SERVICE_EMAIL,
      privateKey:env.VITAL_GA4_PRIVATE_KEY,fetcher});
    const response=await fetcher('https://analyticsdata.googleapis.com/v1beta/properties/'+property+':runReport',{
      method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({dateRanges:[{startDate:'30daysAgo',endDate:'yesterday'}],
        metrics:['sessions','totalUsers','screenPageViews','ecommercePurchases','purchaseRevenue']
        .map(name=>({name})),limit:'1'}),
      signal:AbortSignal.timeout(10000),cache:'no-store'});
    if(!response.ok)throw Error('ga4_report');
    return {status:'ready',data:summarizeGa4(await response.json())};
  }catch{return {status:'unavailable'};}
}
const CLARITY_CACHE_MS=12*60*60*1000;
let clarityCache={token:null,until:0,promise:null};
export async function readClarity(env=process.env,fetcher=fetch,now=Date.now) {
  const token=env.VITAL_CLARITY_EXPORT_TOKEN;
  if(!token)return {status:'not_configured'};
  // Data Cache is shared by Next/Vercel; this additional process-local cache
  // suppresses duplicate requests from concurrent UI mounts in one instance.
  if(clarityCache.token===token&&clarityCache.until>now()&&clarityCache.promise)
    return clarityCache.promise;
  const load=(async()=>{
    try {
      const response=await fetcher('https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=3&dimension1=Device',{
        headers:{Authorization:'Bearer '+token,Accept:'application/json'},
        next:{revalidate:43200},signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error('clarity_api');
      const parsed=summarizeClarity(await response.json());
      return parsed?{status:'ready',data:parsed}:{status:'unavailable'};
    }catch{return {status:'unavailable'};}
  })();
  clarityCache={token,until:now()+CLARITY_CACHE_MS,promise:load};
  return load;
}
export async function readVitalInsights(env=process.env,fetcher=fetch){
  const [ga4,clarity]=await Promise.all([readGa4(env,fetcher),readClarity(env,fetcher)]);
  return {ga4,clarity};
}
