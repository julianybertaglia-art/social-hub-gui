import {createAiMarketingReport} from '../app/lib/server/vital-marketing-ai.mjs';
import {readWindsorMeta} from '../app/lib/server/vital-insights.mjs';
if(process.env.VERCEL_ENV!=='preview')throw Error('preview_only');
const input={kind:'connected',ga4:{sessions:100,purchases:2,purchaseRevenue:200,currency:'BRL',events:[{event:'view_item',count:50},{event:'add_to_cart',count:5}]},meta:{spend:20,linkClicks:10,impressions:300,currency:'BRL'},store:{start:'2026-10-01',end:'2026-10-30',orders:2,revenue:200,topProducts:[{name:'Produto de teste',quantity:2}]}};
let ai,meta;
try{ai=await createAiMarketingReport(input,{apiKey:process.env.GEMINI_API_KEY});console.log('AI provider check:',Boolean(ai?.summary&&ai?.actions?.length));}catch(error){console.log('AI provider check failed:',String(error?.message||'unknown'));throw Error('AI check failed');}
meta=await readWindsorMeta({...process.env,VITAL_META_AD_ACCOUNT_ID:'1876455447050606'});
console.log('Meta source check:',meta.status,'campaigns:',Array.isArray(meta.data?.campaigns));
if(meta.status!=='ready'||!Array.isArray(meta.data?.campaigns))throw Error('Meta check failed');
