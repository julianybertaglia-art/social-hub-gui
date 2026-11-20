import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {readMeta,readWindsorMeta,readGtm,readGa4,readVitalInsights,summarizeGa4Sources,summarizeGa4Events,summarizeMeta,summarizeClarity} from '../app/lib/server/vital-insights.mjs';

const json=body=>new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
const googleEnv={VITAL_GA4_SERVICE_EMAIL:'reader@example.test',VITAL_GA4_PRIVATE_KEY:privateKey};

test('missing credentials do not contact providers or claim connections',async()=>{
 const fetcher=()=>{throw Error('unexpected network');};
 const result=await readVitalInsights({},fetcher);
 assert.deepEqual(Object.values(result).map(x=>x.status),['not_configured','not_configured','not_configured','not_configured']);
});
test('Meta obtains account totals independently from the limited campaign list',async()=>{
 const calls=[];
 const result=await readMeta({VITAL_META_AD_ACCOUNT_ID:'act_12345678',VITAL_META_ADS_READ_TOKEN:'fake-meta-token'},async(url,options)=>{
  calls.push({url,options});const level=new URL(url).searchParams.get('level');
  if(level==='account')return json({data:[{spend:'150.25',impressions:'1000',inline_link_clicks:'40',account_currency:'BRL',date_start:'2026-10-01',date_stop:'2026-10-30'}]});
  return json({data:[{campaign_id:'23',campaign_name:'Jardim',spend:'100',impressions:'600',inline_link_clicks:'20',ignored:'secret'}],paging:{next:'private-url'}});
 });
 assert.equal(result.status,'ready');assert.equal(result.data.spend,150.25);
 assert.equal(result.data.linkClicks,40);assert.equal(result.data.currency,'BRL');assert.equal(result.data.campaigns[0].spend,100);
 assert.equal(result.data.campaignsMore,true);assert.equal(JSON.stringify(result).includes('private-url'),false);
 assert.equal(JSON.stringify(result).includes('secret'),false);assert.equal(calls.length,2);
 for(const {url,options} of calls){assert.ok(url.startsWith('https://graph.facebook.com/v26.0/act_12345678/insights?'));
  assert.equal(new URL(url).searchParams.get('date_preset'),'last_30d');assert.ok(!url.includes('fake-meta-token'));
  assert.equal(options.headers.Authorization,'Bearer fake-meta-token');assert.equal(options.cache,'no-store');}
});
test('Meta handles incomplete data, invalid account IDs and upstream errors without exposing secrets',async()=>{
 let calls=0;
 const malformed=await readMeta({VITAL_META_AD_ACCOUNT_ID:'123/../../evil',VITAL_META_ADS_READ_TOKEN:'fake-token'},()=>{calls++;});
 assert.equal(malformed.status,'not_configured');assert.equal(calls,0);
 const data=summarizeMeta({data:[{spend:null,impressions:'',inline_link_clicks:'bad'}]},null);
 assert.equal(data.spend,null);assert.equal(data.impressions,null);assert.equal(data.linkClicks,null);assert.equal(data.campaigns,null);
 const failed=await readMeta({VITAL_META_AD_ACCOUNT_ID:'12345678',VITAL_META_ADS_READ_TOKEN:'fake-token'},async()=>new Response('fake-token',{status:403}));
 assert.deepEqual(failed,{status:'unavailable'});
 const partial=await readMeta({VITAL_META_AD_ACCOUNT_ID:'12345678',VITAL_META_ADS_READ_TOKEN:'fake-token'},async url=>
  new URL(url).searchParams.get('level')==='campaign'?new Response('',{status:403}):json({data:[{spend:'4',account_currency:'BRL'}]}));
 assert.equal(partial.status,'ready');assert.equal(partial.data.spend,4);assert.equal(partial.data.campaigns,null);
});
test('Windsor reads one specified account and keeps totals independent of campaign truncation',async()=>{
 const requests=[];const env={VITAL_META_PROVIDER:'windsor',VITAL_META_AD_ACCOUNT_ID:'act_12345678',WINDSOR_API_KEY:'fake-private-key'};
 const result=await readMeta(env,async(url,options)=>{
  requests.push({url,options});const params=new URL(url).searchParams;
  if(!params.get('fields').includes('campaign_id'))return json({data:[{account_id:'12345678',account_currency:'BRL',spend:'123.45',impressions:400,link_clicks:'20'}]});
  return json({data:Array.from({length:26},(_,i)=>({account_id:'act_12345678',campaign_id:String(i+1),campaign:`Campanha ${i+1}`,spend:'1.25',impressions:'10',link_clicks:'2',private_detail:'ignore'}))});
 });
 assert.equal(result.status,'ready');assert.equal(result.data.provider,'windsor');
 assert.equal(result.data.currency,'BRL');assert.equal(result.data.spend,123.45);assert.equal(result.data.linkClicks,20);
 assert.equal(result.data.campaigns.length,25);assert.equal(result.data.campaignsMore,true);
 assert.equal(result.data.campaigns[0].name,'Campanha 1');
 assert.ok(!JSON.stringify(result).includes('fake-private-key'));assert.ok(!JSON.stringify(result).includes('private_detail'));
 assert.equal(requests.length,2);
 for(const {url,options} of requests){const u=new URL(url);
  assert.equal(u.origin,'https://connectors.windsor.ai');assert.equal(u.pathname,'/facebook');
  assert.equal(u.searchParams.get('select_accounts'),'12345678');assert.equal(u.searchParams.get('date_preset'),'last_30d');
  assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');}
});
test('Windsor rejects wrong accounts, ambiguous totals and provider errors without exposing secrets',async()=>{
 const env={VITAL_META_AD_ACCOUNT_ID:'12345678',VITAL_WINDSOR_API_KEY:'fake-private-key'};
 const unexpected=await readWindsorMeta(env,async()=>json({data:[{account_id:'87654321',spend:10}]}));
 assert.deepEqual(unexpected,{status:'unavailable'});
 const ambiguous=await readWindsorMeta(env,async()=>json({data:[{account_id:'12345678'},{account_id:'12345678'}]}));
 assert.deepEqual(ambiguous,{status:'unavailable'});
 const failed=await readWindsorMeta(env,async()=>new Response('fake-private-key',{status:403}));
 assert.deepEqual(failed,{status:'unavailable'});
 let calls=0;const invalid=await readWindsorMeta({...env,VITAL_META_AD_ACCOUNT_ID:'../../other'},()=>{calls++;});
 assert.deepEqual(invalid,{status:'not_configured'});assert.equal(calls,0);
});
test('Windsor accepts the same saved key formats as the existing Instagram integration',async()=>{
 for(const raw of ["'WINDSOR_API_KEY=fake-private-key'",'https://connectors.windsor.ai/all?api_key=fake-private-key&fields=date',
  'fake-private-key&fields=date','fake%2Dprivate%2Dkey']){
  const result=await readWindsorMeta({VITAL_META_AD_ACCOUNT_ID:'12345678',WINDSOR_API_KEY:raw},async url=>{
   assert.equal(new URL(url).searchParams.get('api_key'),'fake-private-key');
   return json({data:[{account_id:'12345678'}]});
  });
  assert.equal(result.status,'ready');
 }
});
test('Windsor preserves account totals if campaign data is unavailable and leaves missing metrics unknown',async()=>{
 const result=await readWindsorMeta({VITAL_META_AD_ACCOUNT_ID:'12345678',WINDSOR_API_KEY:'fake'},async url=>{
  if(new URL(url).searchParams.get('fields').includes('campaign_id'))return new Response('',{status:503});
  return json({data:[{account_id:'12345678',spend:'4',link_clicks:null}]});
 });
 assert.equal(result.status,'ready');assert.equal(result.data.spend,4);assert.equal(result.data.linkClicks,null);
 assert.equal(result.data.impressions,null);assert.equal(result.data.currency,null);assert.equal(result.data.campaigns,null);
});
test('GA4 reads sessions by source and campaign with readonly scope, and keeps totals if breakdown fails',async()=>{
 const scopes=[];const requests=[];
 const fetcher=async(url,options)=>{
  if(url==='https://oauth2.googleapis.com/token'){
   const assertion=options.body.get('assertion');scopes.push(JSON.parse(Buffer.from(assertion.split('.')[1],'base64url')).scope);
   return json({access_token:'fake-google-token'});
  }
  assert.ok(url.startsWith('https://analyticsdata.googleapis.com/'));assert.equal(options.headers.Authorization,'Bearer fake-google-token');
  const body=JSON.parse(options.body);requests.push(body);
  if(body.dimensions?.[0]?.name==='eventName')return json({dimensionHeaders:[{name:'eventName'}],metricHeaders:[{name:'eventCount'}],
    rows:[{dimensionValues:[{value:'view_item'}],metricValues:[{value:'25'}]},
      {dimensionValues:[{value:'add_to_cart'}],metricValues:[{value:'3'}]}]});
  if(body.dimensions)return json({dimensionHeaders:[{name:'sessionCampaignName'},{name:'sessionSourceMedium'}],metricHeaders:[{name:'sessions'}],
    rows:[{dimensionValues:[{value:'primavera'},{value:'facebook / paid'}],metricValues:[{value:'15'}]}]});
  return json({metricHeaders:[{name:'sessions'},{name:'purchaseRevenue'}],rows:[{metricValues:[{value:'20'},{value:'-5'}]}],metadata:{currencyCode:'BRL'}});
 };
 const result=await readGa4({...googleEnv,VITAL_GA4_PROPERTY_ID:'123456'},fetcher);
 assert.equal(result.status,'ready');assert.equal(result.data.sessions,20);assert.equal(result.data.purchaseRevenue,-5);
 assert.equal(result.data.currency,'BRL');assert.deepEqual(result.data.sources,[{source:'facebook / paid',campaign:'primavera',sessions:15}]);
 assert.deepEqual(result.data.events,[{event:'view_item',count:25},{event:'add_to_cart',count:3},
   {event:'begin_checkout',count:null},{event:'purchase',count:null}]);
 assert.deepEqual(scopes,['https://www.googleapis.com/auth/analytics.readonly']);assert.equal(requests.length,3);
 assert.equal(summarizeGa4Sources({rows:[]}),null);
 const partial=await readGa4({...googleEnv,VITAL_GA4_PROPERTY_ID:'123456'},async(url,options)=>{
  if(url.includes('oauth2.googleapis.com'))return json({access_token:'fake'});
  if(JSON.parse(options.body).dimensions)return new Response('',{status:403});
  return json({metricHeaders:[{name:'sessions'}],rows:[{metricValues:[{value:'2'}]}]});
 });
 assert.equal(partial.status,'ready');assert.equal(partial.data.sessions,2);assert.equal(partial.data.sources,null);assert.equal(partial.data.events,null);
 assert.equal(summarizeGa4Events({rows:[]}),null);
});
test('GTM requests only published-version metadata and does not return tag contents',async()=>{
 const scope=[];let target='';
 const result=await readGtm({...googleEnv,VITAL_GTM_ACCOUNT_ID:'123',VITAL_GTM_CONTAINER_ID:'456'},async(url,options)=>{
  if(url.includes('oauth2.googleapis.com')){
   scope.push(JSON.parse(Buffer.from(options.body.get('assertion').split('.')[1],'base64url')).scope);return json({access_token:'fake'});
  }
  target=url;assert.equal(options.headers.Authorization,'Bearer fake');
  return json({containerVersionId:'5',container:{publicId:'GTM-EXAMPLE'},tag:[{name:'private-tag-content'}]});
 });
 assert.equal(result.status,'ready');assert.deepEqual(result.data,{version:'5',publicId:'GTM-EXAMPLE'});
 assert.deepEqual(scope,['https://www.googleapis.com/auth/tagmanager.readonly']);
 assert.equal(target,'https://tagmanager.googleapis.com/tagmanager/v2/accounts/123/containers/456/versions:live');
 assert.equal(JSON.stringify(result).includes('private-tag-content'),false);
});
test('Clarity missing values remain unavailable instead of becoming zero',()=>{
 const data=summarizeClarity([{metricName:'Traffic',information:[{Device:'Mobile',totalSessionCount:'10'}]}]);
 assert.equal(data.sessions,10);assert.equal(data.botSessions,null);
});
