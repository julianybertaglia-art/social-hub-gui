import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBridgeSecret,checkAgentTokenFormat,secureEqual,sectorFromStage,
  SECTORS,ASSIGNEES } from '../app/api/integrations/argo/v1/bridge.mjs';

function code(path){return readFileSync(new URL(path,import.meta.url),'utf8');}

test('bridge keys are random, service-only and digest-only',()=>{
 const a=createBridgeSecret(),b=createBridgeSecret();
 assert.equal(checkAgentTokenFormat(a.token),true);
 assert.notEqual(a.token,b.token);
 assert.equal(a.digest.length,64);
 assert.equal(a.token.includes(a.digest),false);
 assert.equal(secureEqual(a.digest,a.digest),true);
 assert.equal(secureEqual(a.digest,b.digest),false);
 assert.equal(secureEqual('short','longer'),false);
});
test('Vivi sectors stay deterministic, default belongs to Tide',()=>{
 assert.equal(sectorFromStage('await_human','Produtos Vital Decor'),'comercial_vital');
 assert.equal(sectorFromStage('await_human','Geradores BLUETTI'),'bluetti');
 assert.equal(sectorFromStage('await_human','Produtos VTX Fitness'),'vtx');
 assert.equal(sectorFromStage('await_human','Pós-venda · Mercado Livre'),'pos_venda');
 assert.equal(sectorFromStage('await_human','Revenda'),'atacado');
 assert.equal(sectorFromStage('affiliate_form','Afiliado TikTok'),'afiliados');
 assert.equal(SECTORS.length,6);
 assert.deepEqual(ASSIGNEES,['tide','andrey','vitor']);
});
test('integration enforces owner, agent, assignment and 24h reply window',()=>{
 const bridge=code('../app/api/integrations/argo/v1/bridge.mjs');
 const list=code('../app/api/integrations/argo/v1/conversations/route.js');
 const reply=code('../app/api/integrations/argo/v1/conversations/[phone]/messages/route.js');
 const events=code('../app/api/integrations/argo/v1/conversations/[phone]/actions/route.js');
 for(const f of [list,reply,events])assert.match(f,/authorizeAgent\(request\)/);
 for(const f of [list,reply])assert.match(f,/owner_user_id|ownerId/);
 assert.match(bridge,/workspace_id',BRIDGE_WORKSPACE/);
 assert.match(bridge,/eq\('assigned_to',ctx.agent\)/);
 assert.match(reply,/assignedContact\(ctx,phone\)/);
 assert.match(reply,/canReplyWithinWindow\(last\?\.sent_at\)/);
 assert.match(reply,/idempotency-key/);
 assert.match(reply,/vital_whatsapp_argo_sends/);
 assert.doesNotMatch(list,/access_token/);
 assert.doesNotMatch(reply,/META_WHATSAPP_APP_SECRET/);
});
test('Tide owner remains default and can revoke keys',()=>{
 const keys=code('../app/api/vital-whatsapp/argo-keys/route.js');
 const config=code('../app/api/vital-whatsapp/argo-routing/route.js');
 const vivi=code('../app/api/vital-connections/vivi-flow.mjs');
 const hub=code('../app/HubFrame.js');
 assert.match(keys,/revoked_at/);
 assert.match(keys,/createBridgeSecret\(\)/);
 assert.match(config,/vital_whatsapp_sector_settings/);
 assert.match(config,/vital_whatsapp_assignments/);
 assert.match(vivi,/routeViviConversation/);
 assert.match(hub,/<ArgoBridgePanel \/>/);
 assert.match(bridgeSetup(),'default_assignee text not null default \'tide\'');
});
function bridgeSetup(){
 return code('../supabase/migrations/20261009150000_argo_bridge_vital.sql');
}
