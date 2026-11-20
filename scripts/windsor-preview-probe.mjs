import {readWindsorMeta} from '../app/lib/server/vital-insights.mjs';
if(process.env.VERCEL_ENV!=='preview') throw Error('preview_only');
const result=await readWindsorMeta({...process.env,VITAL_META_AD_ACCOUNT_ID:'1876455447050606'});
console.log('Final Windsor adapter:',result.status,'campaigns available:',Array.isArray(result.data?.campaigns));
if(result.status!=='ready'||!Array.isArray(result.data.campaigns)) throw Error('Windsor preview data unavailable');
