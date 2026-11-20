import {createAiMarketingReport} from '../app/lib/server/vital-marketing-ai.mjs';
const begin=Date.now();
try{
 const result=await createAiMarketingReport({kind:'manual',period:'30',metrics:{visits:100,orders:3,spend:500,revenue:1500}},{apiKey:process.env.GEMINI_API_KEY,
  fetcher:(url,init)=>{const body=JSON.parse(init.body);body.generationConfig.thinkingConfig.thinkingLevel='minimal';body.generationConfig.maxOutputTokens=1100;
   return fetch(url,{...init,body:JSON.stringify(body),signal:AbortSignal.timeout(55000)});}});
 console.log('FULLDIAG success='+Boolean(result.summary&&result.actions.length)+' elapsed='+(Date.now()-begin)+'ms');
}catch(e){console.log('FULLDIAG error='+e.name+' message='+String(e.message).slice(0,50)+' elapsed='+(Date.now()-begin)+'ms');}
