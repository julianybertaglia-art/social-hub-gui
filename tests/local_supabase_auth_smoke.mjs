// Isolated CI only: local Supabase Auth, local PostgreSQL and local Next.js.
// Creates fictional users; never reads an account, tenant, or key from production.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';

const [mode,idsPath]=process.argv.slice(2);
const base=process.env.API_URL||process.env.SUPABASE_URL;
const adminKey=process.env.SERVICE_ROLE_KEY;
const anonKey=process.env.ANON_KEY;
const password='ci-only-FakePassword!2026';
if(!base?.startsWith('http://127.0.0.1:')||!adminKey||!anonKey) {
 throw Error('Local test requires loopback Supabase Auth with disposable keys.');
}
const names=['owner','otherOwner','supervisor','otherSupervisor','agent'];
const admin=createClient(base,adminKey,{auth:{persistSession:false,autoRefreshToken:false}});
const emailFor=name=>'tide-auth-ci-'+name+'@example.invalid';

async function seed(){
 const ids={};
 for(const name of names){
  const {data,error}=await admin.auth.admin.createUser({
   email:emailFor(name),password,email_confirm:true,
  });
  if(error||!data?.user?.id)throw Error('Failed to create local Auth fixture '+name+': '+(error?.message||'missing user'));
  ids[name]=data.user.id;
 }
 writeFileSync(idsPath,JSON.stringify(ids),{mode:0o600});
 console.log('PASS: created five disposable Auth users with server-generated IDs');
}

async function verify(){
 const ids=JSON.parse(readFileSync(idsPath,'utf8'));
 const tokens={};
 for(const name of names){
  const anon=createClient(base,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await anon.auth.signInWithPassword({email:emailFor(name),password});
  assert.ifError(error);
  assert.equal(data.user.id,ids[name]);
  assert.ok(data.session.access_token);
  const verified=await admin.auth.getUser(data.session.access_token);
  assert.equal(verified?.data?.user?.id,ids[name]);
  tokens[name]=data.session.access_token;
 }
 console.log('PASS: five real, independently signed-in local GoTrue sessions');

 const api='http://127.0.0.1:3007';
 async function check(path,token,status,scope){
  const response=await fetch(api+path,{
   method:'GET',headers:token?{Authorization:'Bearer '+token}:{},
   signal:AbortSignal.timeout(15000),
  });
  const payload=await response.json().catch(()=>({}));
  assert.equal(response.status,status,path+': '+JSON.stringify(payload));
  if(scope)assert.equal(payload.scope,scope,path);
  assert.match(response.headers.get('cache-control')||'',/no-store/);
  return payload;
 }
 await check('/api/auth/access-scope',tokens.owner,200,'admin');
 await check('/api/auth/access-scope',tokens.supervisor,200,'staff_pending');
 await check('/api/auth/access-scope',tokens.agent,200,'staff_pending');
 await check('/api/auth/access-scope',tokens.otherOwner,403);
 await check('/api/auth/access-scope',null,401);
 await check('/api/auth/access-scope','invalid-ci-token',401);
 console.log('PASS: local TidePlace HTTP access scope applies real JWT, owner, pending staff and outsider denial');

 const ownerMia=await check('/api/crm/vital/mia?workspace=vital-decor',tokens.owner,200);
 assert.deepEqual(ownerMia.threads,[]);
 assert.deepEqual(ownerMia.messages,[]);
 assert.equal(ownerMia.role,'owner');
 await check('/api/crm/vital/mia?workspace=gui-nonato',tokens.owner,200);
 await check('/api/crm/vital/mia?workspace=gui-nonato',tokens.agent,403);
 await check('/api/crm/vital/mia?workspace=vital-decor',tokens.agent,403);
 await check('/api/crm/vital/mia?workspace=vital-decor',tokens.otherOwner,403);
 await check('/api/crm/vital/mia?workspace=invalid',tokens.owner,400);
 console.log('PASS: MIA HTTP read scopes deny unauthorized users and workspaces');

 async function post(url,token,body,origin=api){
  const response=await fetch(api+url,{
   method:'POST',headers:{
    'Content-Type':'application/json',Authorization:'Bearer '+token,
    Origin:origin,
   },body:JSON.stringify(body),signal:AbortSignal.timeout(15000),
  });
  return {status:response.status,payload:await response.json().catch(()=>({}))};
 }
 const reply=await post('/api/crm/vital/reply',tokens.owner,{to:'5511000000111',text:'NO-REAL-SEND'});
 assert.equal(reply.status,403);
 // Reject an actual cross-origin write, even with a valid locally signed JWT.
 const csrf=await post('/api/crm/vital/mia',tokens.owner,{message:'Tentativa inválida'},'https://cross-origin.invalid');
 assert.equal(csrf.status,403);
 assert.match(csrf.payload.error||'',/Origem inválida/);
 // Next.js local may normalize request.url to localhost even if bound to 127.0.0.1.
 // Probe only those two loopback origins; no external service or credential is used.
 let mia=null;
 for(const origin of ['http://localhost:3007',api]){
  mia=await post('/api/crm/vital/mia',tokens.owner,{message:'Pergunta fictícia sem Gemini',workspace:'vital-decor'},origin);
  if(mia.status!==403||!String(mia.payload.error).includes('Origem inválida'))break;
 }
 // No Gemini key in this isolated run: fail closed without external API call.
 assert.equal(mia.status,503,JSON.stringify(mia.payload));
 const threadCount=await admin.from('crm_vital_mia_messages').select('*',{count:'exact',head:true});
 assert.ifError(threadCount.error);
 assert.equal(threadCount.count,0,'Failed Gemini call must not save fictional answers');
 console.log('PASS: sending disabled and Gemini refuses missing key without false saved answers');

 const client=createClient(base,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {error}=await client.from('crm_vital_mia_messages').select('id').limit(1);
 assert.ok(error,'Browser role unexpectedly reads MIA private history');
 console.log('PASS: real local PostgREST denies direct browser reads of MIA history');
}

if(!['seed','verify'].includes(mode)||!idsPath)throw Error('Usage: node local_supabase_auth_smoke.mjs seed|verify /tmp/users.json');
await (mode==='seed'?seed():verify());
