import {readWindsorMeta} from '../app/lib/server/vital-insights.mjs';
if(process.env.VERCEL_ENV!=='preview') throw Error('preview_only');
console.log('Windsor key configured:',Boolean(process.env.WINDSOR_API_KEY));
const pending=[];
const fetcher=(url,options)=>{
 const p=(async()=>{
  const target=new URL(url),kind=target.searchParams.get('fields')?.includes('campaign_id')?'campaigns':'total';
  let response;
  try{response=await fetch(url,options);}catch(error){console.log('Windsor network:',kind,error?.name);throw error;}
  console.log('Windsor HTTP:',kind,response.status);
  try{
   const body=await response.clone().json(), rows=Array.isArray(body)?body:(body?.data??body?.rows??body?.result);
   const msg=JSON.stringify(body).toLowerCase();
   console.log('Windsor response categories:',kind,
    'invalid-key',/invalid.{0,30}(api.?key|token)|(api.?key|token).{0,30}invalid/.test(msg),
    'authentication',/auth|unauthori|credential|api.?key/.test(msg),
    'account',/account/.test(msg),'field',/field|dimension|metric/.test(msg),
    'limit-or-plan',/limit|plan|source|subscription/.test(msg),'rows',Array.isArray(rows)?rows.length:'not-array',
    'matching',Array.isArray(rows)?rows.every(row=>String(row?.account_id).replace(/^act_/,'')==='1876455447050606'):false);
  }catch{console.log('Windsor non-JSON:',kind);}
  return response;
 })();pending.push(p);return p;
};
const result=await readWindsorMeta({...process.env,VITAL_META_AD_ACCOUNT_ID:'1876455447050606'},fetcher);
await Promise.allSettled(pending);
console.log('Windsor adapter status:',result.status,'campaigns available:',Array.isArray(result.data?.campaigns));
if(result.status!=='ready'||!Array.isArray(result.data.campaigns)) throw Error('Windsor preview data unavailable');
