import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const migration=source('supabase/migrations/20261103150000_vital_crm_notes_reply_mia_security.sql');

test('staff APIs authenticate from the bearer token and derive grants on the server',()=>{
 const access=source('app/lib/vital-crm-access.mjs');
 const memberAccess=source('app/lib/vital-crm-member.mjs');
 const live=source('app/api/crm/vital/live/route.js');
 const reply=source('app/api/crm/vital/reply/route.js');
 const mia=source('app/api/crm/vital/mia/route.js');
 assert.match(access,/db\.auth\.getUser\(token\)/);
 assert.match(access,/crm_organization_members/);
 assert.match(access,/crm_vital_member_queues/);
 assert.match(access,/process\.env\.VITAL_CRM_STAFF_ENABLED==='true'/);
 assert.match(memberAccess,/Sua conta não possui filas autorizadas/);
 assert.match(live,/crm_vital_member_queues/);
 assert.match(reply,/crm_vital_member_queues/);
 assert.match(mia,/getVitalCrmMember\(request\)/);
 assert.match(mia,/crm_vital_mia_threads/);
 assert.match(mia,/\.eq\('user_id',userId\)/);
});

test('customer bodies are loaded only after contact routing is authorized; private notes stay internal',()=>{
 const mia=source('app/api/crm/vital/mia/route.js');
 const context=mia.slice(mia.indexOf('async function loadContactContext'),mia.indexOf('async function loadIndicators'));
 assert.ok(context.indexOf('resolveAuthorizedVitalContact')<context.indexOf("from('workspace_meta_messages')"));
 const notes=source('app/api/crm/vital/notes/route.js');
 assert.match(notes,/resolveAuthorizedVitalContact/);
 assert.match(notes,/crm_vital_conversation_notes/);
 assert.doesNotMatch(notes,/graph\.facebook\.com|messages\//);
 assert.match(migration,/create table if not exists public\.crm_vital_conversation_notes/);
 assert.match(migration,/enable row level security/);
 assert.match(migration,/revoke all on public\.crm_vital_conversation_notes from anon,authenticated/);
});

test('atomic transfer enforces an explicit agent grant and records origin, destination, actor and time',()=>{
 const transfer=migration.slice(migration.indexOf('create or replace function public.crm_vital_transfer_atomic'),
  migration.indexOf('create or replace function public.crm_vital_set_status_atomic'));
 assert.match(transfer,/m\.role,m\.can_transfer/);
 assert.match(transfer,/v_role<>'agent' or not v_can_transfer/);
 assert.match(transfer,/p_expected_from/);
 assert.match(transfer,/crm_vital_reply_locks/);
 assert.match(transfer,/crm_vital_transfer_audit/);
 assert.match(transfer,/from_queue,to_queue,changed_by/);
 assert.match(transfer,/using errcode='40001'/);
});

test('status changes are compare-and-set audited and supervisors remain read-only',()=>{
 const status=migration.slice(migration.indexOf('create or replace function public.crm_vital_set_status_atomic'),
  migration.indexOf('create or replace function public.crm_vital_claim_reply_atomic'));
 assert.match(status,/v_role not in \('owner','agent'\)/);
 assert.match(status,/p_expected_updated_at/);
 assert.match(status,/crm_vital_status_audit/);
 assert.match(status,/using errcode='40001'/);
});

test('one reply lease per contact prevents simultaneous sends and Vivi handoff happens before Meta send',()=>{
 const reply=source('app/api/crm/vital/reply/route.js');
 const send=reply.indexOf('graph.facebook.com');
 const lock=reply.indexOf('crm_vital_claim_reply_atomic');
 const handoff=reply.indexOf('reserveViviHandoff(db,handoffArgs)');
 assert.ok(send>0&&lock>0&&lock<send);
 assert.ok(handoff>0&&handoff<send);
 assert.match(reply,/crm_vital_release_reply_atomic/);
 assert.match(migration,/create table if not exists public\.crm_vital_reply_locks/);
 assert.match(migration,/primary key\(organization_id,connection_id,contact_wa_id\)/);
 assert.match(migration,/lease_id=excluded\.lease_id/);
});

test('MIA chat history and request limits are private, bounded and server-only',()=>{
 assert.match(migration,/create table if not exists public\.crm_vital_mia_threads/);
 assert.match(migration,/unique\(id,organization_id,user_id\)/);
 assert.match(migration,/foreign key\(thread_id,organization_id,user_id\)/);
 assert.match(migration,/crm_vital_mia_claim_request_atomic/);
 assert.match(migration,/v_count>=p_limit/);
 assert.match(migration,/crm_vital_mia_save_exchange_atomic/);
 assert.match(migration,/revoke all on public\.crm_vital_mia_threads,public\.crm_vital_mia_messages from anon,authenticated/);
 assert.match(source('app/api/crm/vital/mia/route.js'),/p_limit:20/);
 assert.match(source('app/api/crm/vital/mia/route.js'),/message\.length>1400/);
 assert.match(source('app/lib/vital-mia.mjs'),/maxOutputTokens:800/);
});

test('staff shell is confined to Vital CRM and mobile layouts retain responsive breakpoints',()=>{
 const gate=source('app/CloudGate.js');
 const frame=source('app/HubFrame.js');
 assert.match(gate,/if\s*\(!FULL_HUB_SCOPES\.has\(accessScope\.scope\)\)\s*\{\s*setReady\(true\)/);
 assert.match(frame,/router\.replace\('\/crm\/vital'\)/);
 assert.match(frame,/navGroups=isStaff\?/);
 assert.match(source('app/vital-crm-real.module.css'),/@media\(max-width:700px\)/);
 assert.match(source('app/mia-assistant.module.css'),/@media\(max-width:640px\)/);
});

test('MIA only inserts a suggestion into the selected composer and never sends it',()=>{
 const ui=source('app/MiaAssistant.js');
 assert.match(ui,/tideplace:mia-insert-reply/);
 assert.match(ui,/suggestionContact&&suggestionContact===selectedContact/);
 assert.match(ui,/Inserir no WhatsApp/);
 assert.match(ui,/Revise a resposta antes de usá-la/);
 assert.doesNotMatch(ui,/api\/crm\/vital\/reply|graph\.facebook\.com/);
 assert.match(source('app/tideplace/privacidade/route.js'),/Google Gemini/);
});

test('new MIA storage has RLS and denies direct anonymous/user access',()=>{
 for(const table of ['crm_vital_mia_threads','crm_vital_mia_messages','crm_vital_mia_request_log']) {
  assert.match(migration,new RegExp('create table if not exists public\\.'+table));
  assert.match(migration,new RegExp('alter table public\\.'+table+' enable row level security'));
 }
 assert.match(migration,/revoke all on public\.crm_vital_mia_threads,public\.crm_vital_mia_messages from anon,authenticated/);
 assert.match(migration,/revoke all on public\.crm_vital_mia_request_log from anon,authenticated/);
});
test('supervisor privilege updates are limited to Vital Decor',()=>{
 assert.match(migration,/where requested_role='supervisor' and organization_id in/);
 assert.match(migration,/where role='supervisor' and organization_id in/);
 assert.ok((migration.match(/where workspace_code='vital-decor'/g)||[]).length>=2);
});


test('MIA UI prevents thread switching during a pending answer and rejects responses from previous logins',()=>{
 const ui=source('app/MiaAssistant.js');
 assert.match(ui,/if\(sending\|\|loadingHistory\|\|!identityRef\.current\)return;/);
 assert.match(ui,/if\(identityRef\.current!==requestIdentity\|\|workspaceRef\.current!==requestWorkspace\)return;/);
 assert.match(ui,/setSending\(false\);setLoadingHistory\(false\);/);
 assert.match(ui,/disabled=\{sending\|\|loadingHistory\} onClick=\{newThread\}/);
 assert.match(ui,/disabled=\{sending\|\|loadingHistory\} onChange=\{event=>loadThread/);
 assert.match(ui,/disabled=\{!input\.trim\(\)\|\|sending\|\|loadingHistory\}/);
});

test('MIA chat uses a flexible vertical flow so user and assistant messages align correctly',()=>{
 const css=source('app/mia-assistant.module.css');
 assert.match(css,/\.body\{display:flex;flex:1;flex-direction:column;/);
 assert.match(css,/\.messageUser\{align-self:flex-end;/);
 assert.match(css,/\.messageAssistant\{align-self:flex-start/);
 assert.match(css,/@media\(max-width:640px\)/);
});


test('MIA threads have strict Gui/Vital workspace scoping on every read and creation',()=>{
 const migration=source('supabase/migrations/20261103150000_vital_crm_notes_reply_mia_security.sql');
 const route=source('app/api/crm/vital/mia/route.js');
 const ui=source('app/MiaAssistant.js');
 assert.match(migration,/workspace_code text not null default 'vital-decor' check\(workspace_code in \('vital-decor','gui-nonato'\)\)/);
 assert.match(migration,/crm_vital_mia_threads\(organization_id,user_id,workspace_code,updated_at desc\)/);
 assert.match(route,/async function ownedThread\(db,organizationId,userId,workspaceCode,threadId\)/);
 assert.match(route,/\.eq\('workspace_code',workspaceCode\)/);
 assert.match(route,/\.eq\('workspace_code',workspace\)/);
 assert.match(route,/user_id:userId,workspace_code:workspace,title:'Nova conversa'/);
 assert.match(route,/if\(auth\.access\.role!=='owner'&&workspace!=='vital-decor'\)/);
 assert.match(route,/if\(access\.role!=='owner'&&workspace!=='vital-decor'\)/);
 assert.match(ui,/mia\?workspace='\+encodeURIComponent\(workspace\?\.id\|\|'vital-decor'\)/);
 assert.match(ui,/body:\{mode:'new',workspace:requestWorkspace\}/);
 assert.match(ui,/workspace:requestWorkspace,contact:contactAtSend/);
 assert.match(ui,/workspaceRef\.current!==requestWorkspace/);
 assert.match(ui,/const isVitalCrm=isCrm&&workspace\?\.id==='vital-decor'/);
 assert.match(ui,/const contactAtSend=isVitalCrm\?selectedContact:null/);
 assert.match(ui,/\{isVitalCrm&&<div className=\{css\.quickActions\}/);
});


test('isolated CRM preview bypasses login only for its fictitious route, never production',()=>{
 const shell=source('app/SiteShell.js');
 const route=source('app/preview/crm/page.js');
 const visual=source('app/preview/crm/VisualCRM.js');
 const layout=source('app/layout.js');
 assert.match(shell,/if\(pathname==='\/preview\/crm'\) return children;/);
 assert.match(shell,/return <CloudGate><HubFrame>\{children\}<\/HubFrame><MiaAssistant\/><\/CloudGate>/);
 assert.match(route,/if\(process\.env\.VERCEL_ENV==='production'\) notFound\(\)/);
 assert.match(layout,/<SiteShell isPreview=\{process\.env\.VERCEL_ENV==='preview'\}>\{children\}<\/SiteShell>/);
 assert.match(shell,/if\(isPreview&&pathname==='\/'\) return <VisualCRM\/>/);
 assert.match(shell,/isPreview=false/);
 assert.doesNotMatch(visual,/\bfetch\s*\(|\baxios\b|createClient\s*\(|from ['"].*supabase/i);
 assert.match(visual,/Nenhum WhatsApp, Supabase ou Gemini é acessado nesta página/);
 assert.match(visual,/Cliente exemplo A/);
 assert.match(visual,/MIA_INTROS/);
 assert.match(visual,/canTransferDemo\(profile,current\)/);
 assert.match(visual,/canChangeDemoStatus\(profile,current\)/);
 assert.match(visual,/canReplyDemo\(profile,current\)/);
 assert.match(visual,/role="status" aria-live="polite"/);
});


test('general MIA chat does not require WhatsApp; failed CRM authorization does not burn hourly requests',()=>{
 const route=source('app/api/crm/vital/mia/route.js');
 const post=route.slice(route.indexOf('export async function POST'));
 assert.match(post,/const needsOperationalContext=workspace==='vital-decor'&&\(Boolean\(contact\)\|\|asksForIndicators\)/);
 assert.match(post,/const connection=needsOperationalContext\?await connectionFor\(auth\):null/);
 assert.ok(post.indexOf("const authorized=await loadContactContext")<post.indexOf("crm_vital_mia_claim_request_atomic"));
 assert.ok(post.indexOf("context={operationalIndicators:await loadIndicators")<post.indexOf("crm_vital_mia_claim_request_atomic"));
 assert.ok(post.indexOf("crm_vital_mia_claim_request_atomic")<post.indexOf("const answer=await generateMiaText"));
});


test('enabling CRM notes/status alone cannot enable WhatsApp outbound replies',()=>{
 const reply=source('app/api/crm/vital/reply/route.js');
 const notes=source('app/api/crm/vital/notes/route.js');
 const status=source('app/api/crm/vital/status/route.js');
 assert.match(reply,/if\(process\.env\.VITAL_CRM_REPLY_ENABLED!=='true'\)throw fail\('Respostas do CRM não foram liberadas nesta instalação\.',403\)/);
 assert.doesNotMatch(reply,/VITAL_CRM_WRITES_ENABLED/);
 assert.match(notes,/if\(process\.env\.VITAL_CRM_WRITES_ENABLED!=='true'\)/);
 assert.match(status,/if\(process\.env\.VITAL_CRM_WRITES_ENABLED!=='true'\)/);
 assert.ok(reply.indexOf("VITAL_CRM_REPLY_ENABLED")<reply.indexOf("graph.facebook.com"));
});


test('MIA message ordering is deterministic and independent of equal created_at timestamps',()=>{
 const migration=source('supabase/migrations/20261103150000_vital_crm_notes_reply_mia_security.sql');
 const route=source('app/api/crm/vital/mia/route.js');
 assert.match(migration,/message_order bigint generated always as identity/);
 assert.match(migration,/crm_vital_mia_messages\(organization_id,user_id,thread_id,message_order desc\)/);
 assert.match(migration,/pg_advisory_xact_lock\(hashtext\(p_org::text\|\|':'\|\|p_user::text\),hashtext\(p_thread::text\)\)/);
 assert.match(route,/\.order\('message_order',\{ascending:false\}\)\.limit\(60\)/);
 assert.match(route,/\.order\('message_order',\{ascending:false\}\)\.limit\(8\)/);
});


test('new staff logins cannot send Meta messages without their own explicitly enabled flag',()=>{
 const reply=source('app/api/crm/vital/reply/route.js');
 const live=source('app/api/crm/vital/live/route.js');
 assert.match(reply,/if\(access\.role==='agent'&&process\.env\.VITAL_CRM_STAFF_REPLY_ENABLED!=='true'\)/);
 assert.match(live,/ctx\.access\.role==='owner'\|\|process\.env\.VITAL_CRM_STAFF_REPLY_ENABLED==='true'/);
 assert.match(reply,/process\.env\.VITAL_CRM_REPLY_ENABLED!=='true'/);
});

test('MIA Gemini calls are opt-in and CRM notes use existing timestamp column',()=>{
 const route=source('app/api/crm/vital/mia/route.js');
 assert.match(route,/process\.env\.VITAL_MIA_ENABLED!=='true'&&!localStub/);
 assert.match(route,/const localStub=getLocalMiaTestTransport\(\)/);
 assert.match(route,/\.eq\('contact_wa_id',phone\)\.order\('created_at',\{ascending:false\}\)\.limit\(8\)/);
 assert.doesNotMatch(route,/\.eq\('contact_wa_id',phone\)\.order\('message_order'/);
});
