import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('team entry uses existing Supabase Auth and deliberately excludes HubFrame',()=>{
 const shell=source('app/SiteShell.js');
 const gate=source('app/CloudGate.js');
 assert.match(shell,/if\(pathname==='\/equipe'\) return <CloudGate>\{children\}<\/CloudGate>/);
 assert.match(shell,/return <CloudGate><HubFrame>\{children\}<\/HubFrame><MiaAssistant\/><\/CloudGate>/);
 assert.match(gate,/const isTeamLogin=pathname==='\/equipe'/);
 assert.match(gate,/supabase\.auth\.signInWithPassword\(\{ email, password \}\)/);
 assert.match(gate,/setAccessScope\(payload\)/);
 assert.match(gate,/VITAL DECOR · ACESSO DA EQUIPE/);
 assert.match(gate,/isTeamLogin\?'Entrar na central da equipe'/);
 assert.doesNotMatch(gate,/admin\.createUser\(/);
});

test('staff portal is only rendered for an authorized staff or owner scope',()=>{
 const page=source('app/equipe/page.js');
 assert.match(page,/if\(access\?\.scope!=='staff'&&access\?\.scope!=='admin'\)/);
 assert.match(page,/<VitalCRMReal embedded\/>/);
 assert.match(page,/access\.queueCodes/);
 assert.match(page,/readOnly=access\.role==='supervisor'/);
 assert.match(page,/supabase\.auth\.signOut\(\)/);
 assert.doesNotMatch(page,/\bfetch\s*\(|\bcreateClient\s*\(|NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
 assert.doesNotMatch(page,/getSupabaseAdmin|service_role/i);
});

test('server remains responsible for every staff access and queue filter',()=>{
 const scope=source('app/api/auth/access-scope/route.js');
 const member=source('app/lib/vital-crm-member.mjs');
 const live=source('app/api/crm/vital/live/route.js');
 assert.match(scope,/process\.env\.VITAL_CRM_STAFF_ENABLED!=='true'/);
 assert.match(scope,/scope:'staff_pending',portalEnabled:false/);
 assert.match(scope,/scope:'staff',portalEnabled:true/);
 assert.match(member,/member\.status!=='active'/);
 assert.match(member,/member\.role!=='owner'&&!staffEnabled/);
 assert.match(live,/getVitalCrmMember\(request\)/);
 assert.match(live,/if\(!queue && ctx\.access\.role!=='owner'\)continue/);
 assert.match(live,/if\(queue&&!allowedQueue\(ctx,queue\)\)continue/);
});

test('team layout remains responsive without exposing admin data or registrations',()=>{
 const css=source('app/equipe/equipe.module.css');
 const page=source('app/equipe/page.js');
 assert.match(css,/@media\(max-width:800px\)/);
 assert.match(css,/@media\(max-width:520px\)/);
 assert.match(page,/Somente leitura/);
 assert.match(page,/Área reservada à equipe Vital Decor/);
});
