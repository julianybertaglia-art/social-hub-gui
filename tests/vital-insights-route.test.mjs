import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

let src=await readFile(new URL('../app/api/crm/vital/insights/route.js',import.meta.url),'utf8');
src=src.replace("import {getSupabaseAdmin} from '../../../whatsapp/lib';","const getSupabaseAdmin = () => globalThis.__insightsFixture.db;")
 .replace("import {bearerToken} from '../../../vital-connections/helpers.mjs';","const bearerToken = () => globalThis.__insightsFixture.token;")
 .replace("'../../../../lib/server/vital-store-session.mjs'",JSON.stringify(new URL('../app/lib/server/vital-store-session.mjs',import.meta.url).href))
 .replace("import {readVitalInsights} from '../../../../lib/server/vital-insights.mjs';", "const readVitalInsights = async () => { globalThis.__insightsFixture.calls++; return {meta:{status:'not_configured'}}; };");
const {GET}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const organizationId='11111111-1111-4111-8111-111111111111';
function fixture({id='owner',role='owner',status='active',token='token'}={}){
 const f={token,calls:0};
 f.db={auth:{async getUser(){return {data:{user:{id}},error:null};}},from(table){
  const q={select(){return q;},eq(){return q;},async maybeSingle(){return table==='crm_organizations'
   ?{data:{id:organizationId,workspace_code:'vital-decor',owner_user_id:'owner'},error:null}
   :{data:{organization_id:organizationId,user_id:id,role,status},error:null};}};return q;}};
 return f;
}
async function run(f,{enabled=true}={}){
 const keys=['VITAL_STORE_ORGANIZATION_ID','VITAL_STORE_GUILHERME_USER_ID','VITAL_INSIGHTS_ENABLED'];
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));globalThis.__insightsFixture=f;
 process.env.VITAL_STORE_ORGANIZATION_ID=organizationId;process.env.VITAL_STORE_GUILHERME_USER_ID='gui';
 process.env.VITAL_INSIGHTS_ENABLED=enabled?'true':'false';
 try{const response=await GET(new Request('https://tide.test/api/crm/vital/insights'));
  return {status:response.status,headers:response.headers,body:await response.json()};
 }finally{delete globalThis.__insightsFixture;for(const key of keys){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}}
}
test('owner and individually authorized Guilherme can read sources only when the panel is enabled',async()=>{
 for(const f of [fixture(),fixture({id:'gui',role:'supervisor'})]){
  const result=await run(f);assert.equal(result.status,200);assert.equal(f.calls,1);assert.match(result.headers.get('cache-control'),/no-store/);
 }
 const f=fixture();const disabled=await run(f,{enabled:false});
 assert.equal(disabled.status,200);assert.equal(disabled.body.enabled,false);
 assert.equal(disabled.body.meta.status,'not_configured');assert.equal(f.calls,0);
});
test('unauthenticated, other team members and suspended accounts never query the providers',async()=>{
 for(const [f,status] of [[fixture({token:''}),401],[fixture({id:'vitor',role:'agent'}),403],
  [fixture({id:'other',role:'supervisor'}),403],[fixture({id:'gui',role:'supervisor',status:'suspended'}),403]]){
  const result=await run(f);assert.equal(result.status,status);assert.equal(f.calls,0);
 }
});
