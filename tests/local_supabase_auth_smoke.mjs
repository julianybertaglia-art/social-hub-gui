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
 const writesEnabled=process.env.VITAL_CRM_WRITES_ENABLED==='true';
 const staffEnabled=process.env.VITAL_CRM_STAFF_ENABLED==='true';
 const bridgeEnabled=process.env.VITAL_CRM_ARGO_MANUAL_ENABLED==='true';
 const tokens={};

 // Only a local database receives fictional grants; production membership is untouched.
 const {data:localOrg,error:orgError}=await admin.from('crm_organizations').select('id,owner_user_id')
  .eq('workspace_code','vital-decor').eq('owner_user_id',ids.owner).single();
 assert.ifError(orgError);
 const {data:queueRows,error:queuesError}=await admin.from('crm_vital_queues').select('queue_code')
  .eq('organization_id',localOrg.id);
 assert.ifError(queuesError);
 if(staffEnabled){
  const {error:grantError}=await admin.from('crm_vital_member_queues').upsert(
   queueRows.map(row=>({organization_id:localOrg.id,user_id:ids.supervisor,queue_code:row.queue_code})),
   {onConflict:'organization_id,user_id,queue_code'});
  assert.ifError(grantError);
 }
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
 await check('/api/auth/access-scope',tokens.supervisor,200,staffEnabled?'staff':'staff_pending');
 await check('/api/auth/access-scope',tokens.agent,200,staffEnabled?'staff':'staff_pending');
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
 await check('/api/crm/vital/mia?workspace=vital-decor',tokens.agent,staffEnabled?200:403);
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
 // In CI, requests are served by a loopback Gemini-shaped stub, not Google's API.
 assert.equal(mia.status,200,JSON.stringify(mia.payload));
 assert.match(mia.payload.answer||'',/Resposta do Gemini simulado em CI/);

 // Actual local API creates a new private thread in each workspace without Gemini.
 const newVital=await post('/api/crm/vital/mia',tokens.owner,{mode:'new',workspace:'vital-decor'},'http://localhost:3007');
 assert.equal(newVital.status,201,JSON.stringify(newVital.payload));
 const vitalId=newVital.payload.thread?.id;
 assert.match(vitalId||'',/^[a-f\d-]{36}$/i);
 const vitalList=await check('/api/crm/vital/mia?workspace=vital-decor',tokens.owner,200);
 assert.ok(vitalList.threads.some(row=>row.id===vitalId));
 assert.equal(vitalList.messages.length,0);
 const newGui=await post('/api/crm/vital/mia',tokens.owner,{mode:'new',workspace:'gui-nonato'},'http://localhost:3007');
 assert.equal(newGui.status,201,JSON.stringify(newGui.payload));
 const guiId=newGui.payload.thread?.id;
 assert.notEqual(guiId,vitalId);
 const guiList=await check('/api/crm/vital/mia?workspace=gui-nonato',tokens.owner,200);
 assert.ok(guiList.threads.some(row=>row.id===guiId));
 assert.ok(!guiList.threads.some(row=>row.id===vitalId));
 const mismatched=await check('/api/crm/vital/mia?workspace=gui-nonato&thread='+vitalId,tokens.owner,200);
 assert.equal(mismatched.thread,null);
 const deniedCreate=await post('/api/crm/vital/mia',tokens.otherOwner,{mode:'new',workspace:'vital-decor'},'http://localhost:3007');
 assert.equal(deniedCreate.status,403);
 console.log('PASS: real HTTP MIA thread creation, workspace isolation and outsider denial');
 const before=await admin.from('crm_vital_mia_messages').select('*',{count:'exact',head:true});
 assert.ifError(before.error);
 assert.equal(before.count,2,'One successful stubbed reply must persist a complete user/assistant pair');
 const conversation=await post('/api/crm/vital/mia',tokens.owner,{
  message:'Meu email é ci.client@example.invalid e telefone 5511999998888',
  workspace:'vital-decor',threadId:vitalId},'http://localhost:3007');
 assert.equal(conversation.status,200,JSON.stringify(conversation.payload));
 assert.match(conversation.payload.answer||'',/Resposta do Gemini simulado em CI/);
 assert.doesNotMatch(conversation.payload.answer||'',/ci\.client@example\.invalid|5511999998888/);
 const savedVital=await check('/api/crm/vital/mia?workspace=vital-decor&thread='+vitalId,tokens.owner,200);
 assert.equal(savedVital.messages.length,2);
 assert.deepEqual(savedVital.messages.map(m=>m.role),['user','assistant']);
 assert.doesNotMatch(JSON.stringify(savedVital.messages),/ci\.client@example\.invalid|5511999998888/);
 const personal=await check('/api/crm/vital/mia?workspace=gui-nonato&thread='+vitalId,tokens.owner,200);
 assert.equal(personal.messages.length,0);
 const other=await check('/api/crm/vital/mia?workspace=vital-decor&thread='+vitalId,tokens.otherOwner,403);
 assert.ok(other.error);
 const countBeforeError=await admin.from('crm_vital_mia_messages').select('*',{count:'exact',head:true});
 assert.ifError(countBeforeError.error);
 const failed=await post('/api/crm/vital/mia',tokens.owner,{
  message:'CI_MOCK_FORCE_FAILURE',workspace:'vital-decor',threadId:vitalId},'http://localhost:3007');
 assert.equal(failed.status,502,JSON.stringify(failed.payload));
 assert.doesNotMatch(failed.payload.error||'',/Fake Gemini outage/);
 const countAfterError=await admin.from('crm_vital_mia_messages').select('*',{count:'exact',head:true});
 assert.ifError(countAfterError.error);
 assert.equal(countAfterError.count,countBeforeError.count,'Failed stub request must not persist a partial history turn');
 console.log('PASS: local Gemini-shaped HTTP reply persists isolated, redacted 2-message history and fails safely');


 const client=createClient(base,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {error}=await client.from('crm_vital_mia_messages').select('id').limit(1);
 assert.ok(error,'Browser role unexpectedly reads MIA private history');
 console.log('PASS: real local PostgREST denies direct browser reads of MIA history');


 if(writesEnabled&&staffEnabled){
  assert.equal(process.env.VITAL_CRM_REPLY_ENABLED,'false','WhatsApp delivery must be explicitly disabled');
  // Seed two fake conversations, in disjoint queues, inside disposable PostgREST only.
  const {data:connections,error:connectionError}=await admin.from('workspace_meta_connections').select('id')
   .eq('owner_user_id',ids.owner).eq('workspace_id','vital-decor').eq('platform','whatsapp').single();
  assert.ifError(connectionError);
  const connectionId=connections.id;
  const shopeePhone='5511000000111',atacadoPhone='5511000000222',amazonPhone='5511000000333';
  const fixtures=[
   {phone:shopeePhone,queue:'pos_shopee',message:'Pedido fictício Shopee'},
   {phone:atacadoPhone,queue:'atacado',message:'Pedido fictício Atacado'},
   {phone:amazonPhone,queue:'pos_nv',message:'Pedido fictício para transferência Amazon'},
  ];
  const {error:assignmentError}=await admin.from('crm_vital_queue_assignments').upsert(
   fixtures.map(item=>({
    organization_id:localOrg.id,connection_id:connectionId,owner_user_id:ids.owner,
    contact_wa_id:item.phone,queue_code:item.queue,source:'manual',changed_by:ids.owner,
   })),{onConflict:'organization_id,connection_id,contact_wa_id'});
  assert.ifError(assignmentError);
  const {error:messageError}=await admin.from('workspace_meta_messages').upsert(
   fixtures.map(item=>({
    connection_id:connectionId,owner_user_id:ids.owner,
    contact_wa_id:item.phone,meta_message_id:'ci-inbound-'+item.phone,
    direction:'inbound',message_type:'text',body:item.message,status:'received',
    profile_name:'Cliente exemplo',sent_at:new Date().toISOString(),
   })),{onConflict:'connection_id,meta_message_id'});
  assert.ifError(messageError);

  const getNotes=async(phone,token)=>check('/api/crm/vital/notes?contact='+phone,token,200);
  const agentNotes=await getNotes(shopeePhone,tokens.agent);
  assert.equal(agentNotes.queue,'pos_shopee');
  const deniedNotes=await fetch(api+'/api/crm/vital/notes?contact='+atacadoPhone,{
   headers:{Authorization:'Bearer '+tokens.agent}});
  assert.equal(deniedNotes.status,404);
  const supervisorNotes=await getNotes(atacadoPhone,tokens.supervisor);
  assert.equal(supervisorNotes.queue,'atacado');
  console.log('PASS: agent sees own-sector notes only; supervisor can read another queue');

  const note=await post('/api/crm/vital/notes',tokens.agent,{
   contact:shopeePhone,body:'Nota interna criada apenas para teste offline.'},'http://localhost:3007');
  assert.equal(note.status,201,JSON.stringify(note.payload));
  const refreshed=await getNotes(shopeePhone,tokens.agent);
  assert.ok(refreshed.notes.some(n=>n.body==='Nota interna criada apenas para teste offline.'));
  const supervisorPost=await post('/api/crm/vital/notes',tokens.supervisor,{
   contact:atacadoPhone,body:'Tentativa proibida'},'http://localhost:3007');
  assert.equal(supervisorPost.status,403);
  const agentOther=await post('/api/crm/vital/notes',tokens.agent,{
   contact:atacadoPhone,body:'Tentativa proibida'},'http://localhost:3007');
  assert.equal(agentOther.status,404);
  console.log('PASS: notes POST persists for authorized staff; supervisor and wrong-queue writes denied');

  const miaContact=await post('/api/crm/vital/mia',tokens.owner,{
   workspace:'vital-decor',contact:shopeePhone,action:'summarize',
   message:'Resuma o atendimento de teste com uma nota interna fictícia.',
  },'http://localhost:3007');
  assert.equal(miaContact.status,200,JSON.stringify(miaContact.payload));
  assert.match(miaContact.payload.answer||'',/Resposta do Gemini simulado em CI/);
  console.log('PASS: MIA contact context reads fake CRM messages and notes in chronological order');


  async function patch(path,token,body){
   const response=await fetch(api+path,{
    method:'PATCH',headers:{Authorization:'Bearer '+token,Origin:'http://localhost:3007',
     'Content-Type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(15000),
   });
   return {status:response.status,payload:await response.json().catch(()=>({}))};
  }
  const status=await patch('/api/crm/vital/status',tokens.agent,{contact:shopeePhone,status:'resolved'});
  assert.equal(status.status,200,JSON.stringify(status.payload));
  assert.equal(status.payload.status,'resolved');
  const same=await patch('/api/crm/vital/status',tokens.agent,{contact:shopeePhone,status:'resolved'});
  assert.equal(same.status,200,JSON.stringify(same.payload));
  assert.equal(same.payload.unchanged,true);
  const noRole=await patch('/api/crm/vital/status',tokens.supervisor,{contact:atacadoPhone,status:'resolved'});
  assert.equal(noRole.status,403);
  const noQueue=await patch('/api/crm/vital/status',tokens.agent,{contact:atacadoPhone,status:'resolved'});
  assert.equal(noQueue.status,403);
  const {data:audits,error:auditError}=await admin.from('crm_vital_status_audit').select('id')
   .eq('organization_id',localOrg.id).eq('contact_wa_id',shopeePhone);
  assert.ifError(auditError);
  assert.equal(audits.length,1,'Idempotent status operation must not duplicate audit');
  console.log('PASS: real authenticated status PATCH persists and audits once; supervisor/other queue blocked');

  // Real HTTP transfer changes the persisted queue and instantly revokes
  // old-sector visibility, without any outgoing Meta request.
  const deniedSupervisorTransfer=await patch('/api/crm/vital/live',tokens.supervisor,{
   contact:shopeePhone,toQueue:'atacado'});
  assert.equal(deniedSupervisorTransfer.status,403,JSON.stringify(deniedSupervisorTransfer.payload));
  const deniedAgentTransfer=await patch('/api/crm/vital/live',tokens.agent,{
   contact:shopeePhone,toQueue:'atacado'});
  assert.equal(deniedAgentTransfer.status,403,JSON.stringify(deniedAgentTransfer.payload));
  const moved=await patch('/api/crm/vital/live',tokens.owner,{
   contact:shopeePhone,toQueue:'atacado'});
  assert.equal(moved.status,200,JSON.stringify(moved.payload));
  assert.equal(moved.payload.toQueue,'atacado');
  assert.equal(moved.payload.fromQueue,'pos_shopee');
  const detailAfter=await check('/api/crm/vital/live?contact='+shopeePhone,tokens.owner,200);
  assert.equal(detailAfter.contact.queue,'atacado');
  const oldSector=await fetch(api+'/api/crm/vital/live?contact='+shopeePhone,{
   headers:{Authorization:'Bearer '+tokens.agent}});
  assert.equal(oldSector.status,404);
  const {data:transfers,error:transferAuditError}=await admin.from('crm_vital_transfer_audit')
   .select('from_queue,to_queue,changed_by')
   .eq('organization_id',localOrg.id).eq('contact_wa_id',shopeePhone);
  assert.ifError(transferAuditError);
  assert.equal(transfers.length,1);
  assert.equal(transfers[0].changed_by,ids.owner);
  console.log('PASS: live HTTP transfer is audited, supervisor denied, old-sector access revoked');

  if(bridgeEnabled){
   const {error:keyError}=await admin.from('vital_whatsapp_argo_keys').insert({
    connection_id:connectionId,owner_user_id:ids.owner,agent:'andrey',label:'fixture',
    prefix:'ci-andrey-only',secret_hash:'ci-fake-hash-not-a-real-secret',
    expires_at:new Date(Date.now()+3600000).toISOString(),
   });
   assert.ifError(keyError);
   const forward=await patch('/api/crm/vital/live',tokens.owner,{contact:amazonPhone,toQueue:'pos_amazon'});
   assert.equal(forward.status,200,JSON.stringify(forward.payload));
   assert.equal(forward.payload.toQueue,'pos_amazon');
   const {data:bridge,error:bridgeError}=await admin.from('vital_whatsapp_assignments')
    .select('assigned_to,sector,status').eq('connection_id',connectionId).eq('contact_wa_id',amazonPhone).single();
   assert.ifError(bridgeError);
   assert.deepEqual(bridge,{assigned_to:'andrey',sector:'pos_venda',status:'open'});
   const forwarded=await check('/api/crm/vital/live?contact='+amazonPhone,tokens.owner,200);
   assert.equal(forwarded.contact.queue,'pos_amazon');
   assert.equal(forwarded.contact.replyBlockedByExternal,true);
   const back=await patch('/api/crm/vital/live',tokens.owner,{contact:amazonPhone,toQueue:'pos_nv'});
   assert.equal(back.status,200,JSON.stringify(back.payload));
   const {data:returned,error:returnError}=await admin.from('vital_whatsapp_assignments')
    .select('assigned_to,sector').eq('connection_id',connectionId).eq('contact_wa_id',amazonPhone).single();
   assert.ifError(returnError);
   assert.deepEqual(returned,{assigned_to:'tide',sector:'pos_venda'});
   const {data:bridgeAudits,error:bridgeAuditError}=await admin.from('crm_vital_transfer_audit')
    .select('from_queue,to_queue').eq('organization_id',localOrg.id).eq('contact_wa_id',amazonPhone);
   assert.ifError(bridgeAuditError);
   assert.equal(bridgeAudits.length,2);
   console.log('PASS: real local HTTP routes Amazon to Andrey and returns site to Tide atomically');
  }

  const deniedSend=await post('/api/crm/vital/reply',tokens.owner,{
   to:shopeePhone,text:'Este texto NUNCA deve sair para a Meta.'},'http://localhost:3007');
  assert.equal(deniedSend.status,403,JSON.stringify(deniedSend.payload));
  const {data:outbound,error:outboundError}=await admin.from('workspace_meta_messages')
   .select('id').eq('owner_user_id',ids.owner).eq('direction','outbound');
  assert.ifError(outboundError);
  assert.equal(outbound.length,0);
  console.log('PASS: CRM writes enabled cannot accidentally unlock WhatsApp sends');

  // Owner-only onboarding of a PRE-EXISTING local Auth user. No invitation email
  // is sent in CI, no external provider and no production identity is touched.
  const testInviteEmail='tide-ci-onboarding@example.invalid';
  const {data:invitedUser,error:authCreateError}=await admin.auth.admin.createUser({
   email:testInviteEmail,password,email_confirm:true,
  });
  assert.ifError(authCreateError);
  const {error:inviteDraftError}=await admin.from('crm_vital_invite_drafts').insert({
   organization_id:localOrg.id,email:testInviteEmail,display_name:'Agente Fictício',
   requested_role:'agent',status:'draft',can_transfer:false,
  });
  assert.ifError(inviteDraftError);
  const {error:inviteQueueError}=await admin.from('crm_vital_invite_draft_queues').insert({
   organization_id:localOrg.id,email:testInviteEmail,queue_code:'pos_shopee',
  });
  assert.ifError(inviteQueueError);
  const deniedInvite=await post('/api/crm/vital/team/invite',tokens.agent,{email:testInviteEmail},
   'http://localhost:3007');
  assert.equal(deniedInvite.status,403,'Non-owner can never activate staff');
  const unknownInvite=await post('/api/crm/vital/team/invite',tokens.owner,
   {email:'unapproved@example.invalid'},'http://localhost:3007');
  assert.equal(unknownInvite.status,404,'Only drafted addresses may be invited');
  const activated=await post('/api/crm/vital/team/invite',tokens.owner,
   {email:testInviteEmail},'http://localhost:3007');
  assert.equal(activated.status,200,JSON.stringify(activated.payload));
  assert.equal(activated.payload.existingAccount,true);
  assert.equal(activated.payload.invitationSent,false);
  assert.deepEqual(activated.payload.assignedQueues,['pos_shopee']);
  const {data:member,error:newMemberError}=await admin.from('crm_organization_members')
   .select('role,status,can_transfer,display_name')
   .eq('organization_id',localOrg.id).eq('user_id',invitedUser.user.id).single();
  assert.ifError(newMemberError);
  assert.equal(member.role,'agent');
  assert.equal(member.status,'active');
  assert.equal(member.can_transfer,false);
  const {data:newQueues,error:grantError}=await admin.from('crm_vital_member_queues')
   .select('queue_code').eq('organization_id',localOrg.id).eq('user_id',invitedUser.user.id);
  assert.ifError(grantError);
  assert.deepEqual(newQueues.map(item=>item.queue_code),['pos_shopee']);
  const duplicated=await post('/api/crm/vital/team/invite',tokens.owner,
   {email:testInviteEmail},'http://localhost:3007');
  assert.equal(duplicated.status,409,'Repeated click must not re-invite or regrant');
  const agentClient=createClient(base,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:agentSession,error:agentLoginError}=await agentClient.auth.signInWithPassword({
   email:testInviteEmail,password,
  });
  assert.ifError(agentLoginError);
  const newAccess=await check('/api/auth/access-scope',agentSession.session.access_token,200,'staff');
  assert.deepEqual(newAccess.queueCodes,['pos_shopee']);
  const {data:activatedDraft,error:activatedDraftError}=await admin.from('crm_vital_invite_drafts')
   .select('activated_at').eq('organization_id',localOrg.id).eq('email',testInviteEmail).single();
  assert.ifError(activatedDraftError);
  assert.ok(activatedDraft.activated_at);
  console.log('PASS: owner-only invited-user activation, queue grants, duplicate denial, real login');

 }

}

if(!['seed','verify'].includes(mode)||!idsPath)throw Error('Usage: node local_supabase_auth_smoke.mjs seed|verify /tmp/users.json');
await (mode==='seed'?seed():verify());
