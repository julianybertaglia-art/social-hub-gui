import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {crmConversationStatus} from '../app/lib/vital-crm-queues.mjs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('a new message reopens a resolved conversation and a later resolution closes it again',()=>{
 const resolved={status:'resolved',updated_at:'2026-11-20T12:00:00Z'};
 assert.equal(crmConversationStatus({state:resolved,lastDirection:'inbound',lastMessageAt:'2026-11-20T11:00:00Z'}),'closed');
 assert.equal(crmConversationStatus({state:resolved,lastDirection:'inbound',lastMessageAt:'2026-11-20T13:00:00Z'}),'pending');
 assert.equal(crmConversationStatus({state:{...resolved,updated_at:'2026-11-20T14:00:00Z'},lastDirection:'inbound',lastMessageAt:'2026-11-20T13:00:00Z'}),'closed');
});
test('resolution is owner-scoped independently of the transfer feature',()=>{
 const route=source('app/api/crm/vital/status/route.js');
 const live=source('app/api/crm/vital/live/route.js');
 const migration=source('supabase/migrations/20261120233000_vital_crm_resolution_owner.sql');
 assert.match(route,/VITAL_CRM_STATUS_ENABLED/);
 assert.match(route,/access\.role!=='owner'/);
 assert.match(route,/input\.status==='open'/);
 assert.match(live,/canSetStatus:process\.env\.VITAL_CRM_STATUS_ENABLED/);
 assert.match(migration,/p_source_queue is null and v_role<>'owner'/);
 assert.match(migration,/p_new_status='open' then return/);
 assert.match(migration,/p_expected_updated_at/);
 assert.match(migration,/crm_vital_status_audit/);
});
