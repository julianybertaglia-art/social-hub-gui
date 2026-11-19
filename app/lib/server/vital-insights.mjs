import {createSign} from 'node:crypto';

// A missing field is unknown, not zero. Refunds can make GA4 revenue negative.
const numeric=value=>{
  if((typeof value!=='string'&&typeof value!=='number')||
     (typeof value==='string'&&!value.trim()))return null;
  const n=Number(value);return Number.isFinite(n)?n:null;
};
const nonnegative=value=>{const n=numeric(value);return n!==null&&n>=0?n:null;};
const short=value=>typeof value==='string'?value.slice(0,150):null;
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:null;

export function summarizeGa4(report) {
  const names=(report?.metricHeaders||[]).map(x=>x.name);
  const values=report?.rows?.[0]?.metricValues||[];
  const byName=(name,parser=nonnegative)=>{const at=names.indexOf(name);return at<0?null:parser(values[at]?.value);};
  const currency=typeof report?.metadata?.currencyCode==='string'&&/^[A-Z]{3}$/.test(report.metadata.currencyCode)
    ?report.metadata.currencyCode:null;
  return {period:'Últimos 30 dias completos',currency,sessions:byName('sessions'),
    users:byName('totalUsers'),pageViews:byName('screenPageViews'),
    purchases:byName('ecommercePurchases'),purchaseRevenue:byName('purchaseRevenue',numeric)};
}
export function summarizeGa4Sources(report){
  if(!Array.isArray(report?.dimensionHeaders)||!Array.isArray(report?.metricHeaders))return null;
  const dimensions=report.dimensionHeaders.map(x=>x.name),metrics=report.metricHeaders.map(x=>x.name);
  const source=dimensions.indexOf('sessionSourceMedium'),campaign=dimensions.indexOf('sessionCampaignName'),sessions=metrics.indexOf('sessions');
  if(source<0||campaign<0||sessions<0)return null;
  return (Array.isArray(report.rows)?report.rows:[]).slice(0,10).map(row=>({
    source:short(row.dimensionValues?.[source]?.value)||'Origem não identificada',
    campaign:short(row.dimensionValues?.[campaign]?.value)||'Campanha não identificada',
    sessions:nonnegative(row.metricValues?.[sessions]?.value)
  }));
}
const SHOP_EVENTS=['view_item','add_to_cart','begin_checkout','purchase'];
export function summarizeGa4Events(report){
  if(!Array.isArray(report?.dimensionHeaders)||!Array.isArray(report?.metricHeaders))return null;
  const name=report.dimensionHeaders.findIndex(x=>x.name==='eventName');
  const count=report.metricHeaders.findIndex(x=>x.name==='eventCount');
  if(name<0||count<0)return null;
  const found=new Map();
  for(const row of Array.isArray(report.rows)?report.rows:[]){
    const key=row.dimensionValues?.[name]?.value;
    if(SHOP_EVENTS.includes(key))found.set(key,nonnegative(row.metricValues?.[count]?.value));
  }
  return SHOP_EVENTS.map(event=>({event,count:found.get(event)??null}));
}
export function summarizeClarity(data) {
  const traffic=Array.isArray(data)?data.find(x=>x?.metricName==='Traffic'):null;
  const rows=Array.isArray(traffic?.information)?traffic.information:[];
  if(!rows.length) return null;
  // Do not turn an absent or invalid field into a misleading zero.
  const sum=key=>rows.every(r=>nonnegative(r?.[key])!==null)
    ?rows.reduce((a,r)=>a+nonnegative(r[key]),0):null;
  return {period:'Últimas 72 horas (UTC)',sessions:sum('totalSessionCount'),
    botSessions:sum('totalBotSessionCount'),
    devices:rows.filter(r=>r?.Device && nonnegative(r.totalSessionCount)!==null)
       .map(r=>({device:String(r.Device).slice(0,50),sessions:nonnegative(r.totalSessionCount)}))
       .sort((a,b)=>b.sessions-a.sessions).slice(0,5)};
}

// Accept the private_key PEM field from Google service-account JSON, an escaped
// PEM, or the full downloaded JSON. The raw credential never reaches a response.
export function normalizeGooglePrivateKey(value,email=''){
  if(typeof value!=='string'||!value.trim())throw Error('google_key_format');
  let raw=value.trim();
  if(raw.startsWith('{')||raw.startsWith('"')){
    let parsed;
    try{parsed=JSON.parse(raw);}
    catch{
      if(raw.startsWith('"')&&raw.endsWith('"'))parsed=raw.slice(1,-1);
      else throw Error('google_key_format');
    }
    if(typeof parsed==='string')raw=parsed;
    else if(parsed&&typeof parsed==='object'&&typeof parsed.private_key==='string'){
      if(typeof parsed.client_email==='string'&&
        parsed.client_email.trim().toLowerCase()!==String(email).trim().toLowerCase())
        throw Error('google_key_email_mismatch');
      raw=parsed.private_key;
    }else throw Error('google_key_format');
  }
  const key=raw.trim().replace(/\\\\n/g,'\\n').replace(/\\r\\n/g,'\n')
    .replace(/\\n/g,'\n').replace(/\r\n/g,'\n').trim();
  if(!/^-----BEGIN (?:RSA )?PRIVATE KEY-----\n[\s\S]+\n-----END (?:RSA )?PRIVATE KEY-----$/.test(key))
    throw Error('google_key_format');
  return key;
}
function googleKeyIssue(error){
  if(error?.message==='google_key_format'||error?.message==='google_sign')
    return 'google_key_invalid';
  if(error?.message==='google_key_email_mismatch')return 'google_email_mismatch';
  return null;
}

const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
async function googleAccessToken({email,privateKey,scope,fetcher=fetch,now=Date.now}){
  const timestamp=Math.floor(now()/1000);
  const header=encode({alg:'RS256',typ:'JWT'});
  const claims=encode({iss:email,scope,aud:'https://oauth2.googleapis.com/token',iat:timestamp,exp:timestamp+3000});
  const unsigned=header+'.'+claims;
  const signer=createSign('RSA-SHA256');signer.update(unsigned);signer.end();
  const signingKey=normalizeGooglePrivateKey(privateKey,email);
  let signature;
  try{signature=signer.sign(signingKey).toString('base64url');}
  catch{console.error('[vital-insights] Google JWT signing failed');throw Error('google_sign');}
  const assertion=unsigned+'.'+signature;
  const response=await fetcher('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),
    signal:AbortSignal.timeout(10000),cache:'no-store'});
  if(!response.ok){console.error('[vital-insights] Google token request failed',response.status);throw Error('google_token');}
  const payload=await response.json();
  if(typeof payload?.access_token!=='string')throw Error('google_token');
  return payload.access_token;
}
async function gaReport({property,token,fetcher,body}){
  const response=await fetcher('https://analyticsdata.googleapis.com/v1beta/properties/'+property+':runReport',{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(10000),cache:'no-store'});
  if(!response.ok){console.error('[vital-insights] GA4 report request failed',response.status);throw Error('ga4_report');}
  return response.json();
}
export async function readGa4(env=process.env,fetcher=fetch){
  const property=env.VITAL_GA4_PROPERTY_ID;
  if(!/^\d{5,20}$/.test(property||'')||!env.VITAL_GA4_SERVICE_EMAIL||!env.VITAL_GA4_PRIVATE_KEY)
    return {status:'not_configured'};
  try{
    const token=await googleAccessToken({email:env.VITAL_GA4_SERVICE_EMAIL,privateKey:env.VITAL_GA4_PRIVATE_KEY,
      scope:'https://www.googleapis.com/auth/analytics.readonly',fetcher});
    const dateRanges=[{startDate:'30daysAgo',endDate:'yesterday'}];
    const totals=gaReport({property,token,fetcher,body:{dateRanges,
      metrics:['sessions','totalUsers','screenPageViews','ecommercePurchases','purchaseRevenue'].map(name=>({name})),limit:'1'}});
    const sources=gaReport({property,token,fetcher,body:{dateRanges,
      dimensions:[{name:'sessionSourceMedium'},{name:'sessionCampaignName'}],metrics:[{name:'sessions'}],
      orderBys:[{metric:{metricName:'sessions'},desc:true}],limit:'10'}})
      .then(summarizeGa4Sources).catch(()=>null);
    const events=gaReport({property,token,fetcher,body:{dateRanges,dimensions:[{name:'eventName'}],
      metrics:[{name:'eventCount'}],dimensionFilter:{filter:{fieldName:'eventName',
        inListFilter:{values:SHOP_EVENTS}}},limit:'4'}}).then(summarizeGa4Events).catch(()=>null);
    return {status:'ready',data:{...summarizeGa4(await totals),sources:await sources,events:await events}};
  }catch(error){const issue=googleKeyIssue(error);console.error('[vital-insights] GA4 read failed',issue||error?.name||'UnknownError');return {status:'unavailable',...(issue?{issue}:{})};}
}

const CLARITY_CACHE_MS=12*60*60*1000;
let clarityCache={token:null,until:0,promise:null};
export async function readClarity(env=process.env,fetcher=fetch,now=Date.now) {
  const token=env.VITAL_CLARITY_EXPORT_TOKEN;
  if(!token)return {status:'not_configured'};
  if(clarityCache.token===token&&clarityCache.until>now()&&clarityCache.promise)return clarityCache.promise;
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

export function summarizeMeta(totalResponse,campaignResponse){
  const row=Array.isArray(totalResponse?.data)?totalResponse.data[0]:null;
  const currency=typeof row?.account_currency==='string'&&/^[A-Z]{3}$/.test(row.account_currency)?row.account_currency:null;
  const campaignRows=Array.isArray(campaignResponse?.data)?campaignResponse.data:null;
  return {period:'Últimos 30 dias conforme Meta',start:date(row?.date_start),end:date(row?.date_stop),currency,
    spend:nonnegative(row?.spend),impressions:nonnegative(row?.impressions),linkClicks:nonnegative(row?.inline_link_clicks),
    campaigns:campaignRows?.slice(0,25).map(c=>({id:short(c.campaign_id),name:short(c.campaign_name)||'Campanha sem nome',
      spend:nonnegative(c.spend),impressions:nonnegative(c.impressions),linkClicks:nonnegative(c.inline_link_clicks)}))??null,
    campaignsMore:Boolean(campaignResponse?.paging?.next)};
}
export async function readMeta(env=process.env,fetcher=fetch){
  const id=String(env.VITAL_META_AD_ACCOUNT_ID||'').replace(/^act_/,'');
  const token=env.VITAL_META_ADS_READ_TOKEN;
  if(!/^\d{4,30}$/.test(id)||!token)return {status:'not_configured'};
  const version=/^v\d{1,2}\.\d$/.test(env.VITAL_META_GRAPH_VERSION||'')?env.VITAL_META_GRAPH_VERSION:'v26.0';
  const request=async level=>{
    const url=new URL('https://graph.facebook.com/'+version+'/act_'+id+'/insights');
    url.searchParams.set('date_preset','last_30d');url.searchParams.set('level',level);
    url.searchParams.set('fields',(level==='account'?'account_currency,':'campaign_id,campaign_name,')+'spend,impressions,inline_link_clicks');
    if(level==='campaign')url.searchParams.set('limit','25');
    const response=await fetcher(url.toString(),{headers:{Authorization:'Bearer '+token,Accept:'application/json'},
      signal:AbortSignal.timeout(10000),cache:'no-store'});
    if(!response.ok)throw Error('meta_insights');
    const body=await response.json();if(!Array.isArray(body?.data))throw Error('meta_insights');return body;
  };
  try{
    const campaigns=request('campaign').catch(()=>null);
    const total=await request('account');
    return {status:'ready',data:summarizeMeta(total,await campaigns)};
  }catch{return {status:'unavailable'};}
}

export async function readGtm(env=process.env,fetcher=fetch){
  const account=env.VITAL_GTM_ACCOUNT_ID,container=env.VITAL_GTM_CONTAINER_ID;
  const email=env.VITAL_GA4_SERVICE_EMAIL,privateKey=env.VITAL_GA4_PRIVATE_KEY;
  if(!/^\d{1,30}$/.test(account||'')||!/^\d{1,30}$/.test(container||'')||!email||!privateKey)
    return {status:'not_configured'};
  try{
    const token=await googleAccessToken({email,privateKey,scope:'https://www.googleapis.com/auth/tagmanager.readonly',fetcher});
    const url='https://tagmanager.googleapis.com/tagmanager/v2/accounts/'+account+'/containers/'+container+'/versions:live';
    const response=await fetcher(url,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},
      signal:AbortSignal.timeout(10000),cache:'no-store'});
    if(!response.ok){console.error('[vital-insights] GTM live request failed',response.status);throw Error('gtm_live');}
    const body=await response.json();
    if(!body||typeof body!=='object'||!body.containerVersionId)throw Error('gtm_live');
    // Never return tags, triggers, tag source or other container configuration.
    return {status:'ready',data:{publicId:short(body.container?.publicId),version:short(body.containerVersionId)}};
  }catch(error){const issue=googleKeyIssue(error);console.error('[vital-insights] GTM read failed',issue||error?.name||'UnknownError');return {status:'unavailable',...(issue?{issue}:{})};}
}
export async function readVitalInsights(env=process.env,fetcher=fetch){
  const [ga4,clarity,meta,gtm]=await Promise.all([readGa4(env,fetcher),readClarity(env,fetcher),readMeta(env,fetcher),readGtm(env,fetcher)]);
  return {ga4,clarity,meta,gtm};
}
