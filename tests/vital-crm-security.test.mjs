import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const migration=source('supabase/migrations/20261103120000_vital_crm_notes_reply_mia_security.sql');

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
 assert.ok(reply.indexOf('crm_vital_claim_reply_atomic')<reply.indexOf('graph.facebook.com'));
 assert.ok(reply.indexOf("stage:'await_human'")<reply.indexOf('graph.facebook.com'));
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
