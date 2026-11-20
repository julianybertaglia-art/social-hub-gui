import {readWindsorMeta} from '../app/lib/server/vital-insights.mjs';
if(process.env.VERCEL_ENV!=='preview') throw Error('preview_only');
console.log('Windsor key is configured:',Boolean(process.env.WINDSOR_API_KEY));
const fetcher=async(url,options)=>{
 const target=new URL(url),kind=target.searchParams.get('fields')?.includes('campaign_id')?'campaigns':'total';
 let response;
 try{response=await fetch(url,options);}catch(error){console.log('Windsor network result:',kind,error?.name);throw error;}
 console.log('Windsor HTTP result:',kind,response.status);
 try{
  const body=await response.clone().json(),rows=Array.isArray(body)?body:(body?.data??body?.rows??body?.result);
  console.log('Windsor response summary:',kind,'keys',Object.keys(body||{}).slice(0,12),'rows',Array.isArray(rows)?rows.length:'not-array',
   'matching',Array.isArray(rows)?rows.every(row=>String(row?.account_id).replace(/^act_/,'')==='1876455447050606'):false);
 }catch{console.log('Windsor response was not JSON:',kind);}
 return response;
};
const result=await readWindsorMeta({...process.env,VITAL_META_AD_ACCOUNT_ID:'1876455447050606'},fetcher);
console.log('Windsor adapter status:',result.status,'campaigns available:',Array.isArray(result.data?.campaigns));
if(result.status!=='ready'||!Array.isArray(result.data.campaigns)) throw Error('Windsor preview data unavailable');
