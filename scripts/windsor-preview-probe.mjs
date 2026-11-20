import {readWindsorMeta} from '../app/lib/server/vital-insights.mjs';
if(process.env.VERCEL_ENV!=='preview')throw Error('preview_only');
let old=String(process.env.WINDSOR_API_KEY||'').trim().replace(/^['"]|['"]$/g,'');
if(old.startsWith('WINDSOR_API_KEY='))old=old.slice('WINDSOR_API_KEY='.length).trim();
if(old.includes('api_key=')){try{old=new URL(old).searchParams.get('api_key')||old;}catch{const m=old.match(/[?&]api_key=([^&\\s]+)/);if(m?.[1])old=decodeURIComponent(m[1]);}}
try{old=decodeURIComponent(old);}catch{}
old=old.split('&')[0].split(/\\s/)[0].trim();
console.log('Windsor key present:',Boolean(old));
const allow=new Set('invalid missing expired bad no access key account accounts field fields permission permissions rate subscription data connect must plan free selected paid future past date error user not found source parameter this the for is an and of your to with status insufficient wrong unknown unsupported use provide please contact you can could has have been authorized available needs required from that one id ad no access request please check settings data api subscription over maximum limit query string key all api_key'.split(' '));
let pending=[];
const fetcher=(url,options)=>{
 const p=(async()=>{const kind=new URL(url).searchParams.get('fields')?.includes('campaign_id')?'campaigns':'total';
  let response;
  try{response=await fetch(url,options);}catch(error){console.log('Windsor network:',kind,error?.name);throw error;}
  let detail='';
  try{const body=await response.clone().json();
   const msg=String(body?.error??'').toLowerCase().match(/[a-z_]+/g)||[];
   detail=msg.filter(word=>allow.has(word)).slice(0,120).join(' ');
   console.log('Windsor HTTP:',kind,response.status,'provider words:',detail,'numeric code:',typeof body?.code==='number'?body.code:'none');
  }catch{console.log('Windsor non-JSON:',kind,response.status);}
  return response;
 })();pending.push(p);return p;
};
for(const [name,key] of [['original',process.env.WINDSOR_API_KEY],['existing-normalization',old]]){
 pending=[];const result=await readWindsorMeta({VITAL_META_AD_ACCOUNT_ID:'1876455447050606',VITAL_WINDSOR_API_KEY:key},fetcher);
 await Promise.allSettled(pending);console.log('Windsor adapter',name,'status:',result.status,'campaigns available:',Array.isArray(result.data?.campaigns));
 if(result.status==='ready'&&Array.isArray(result.data.campaigns))process.exit(0);
}
throw Error('Windsor preview data unavailable');
