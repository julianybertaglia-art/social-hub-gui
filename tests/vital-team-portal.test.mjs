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


test('invites require administrator, existing approved drafts, separate release flags and production',()=>{
 const route=source('app/api/crm/vital/team/invite/route.js');
 const management=source('app/api/crm/vital/team/route.js');
 const ui=source('app/VitalCRMTeam.js');
 assert.match(route,/env\.VITAL_CRM_INVITES_ENABLED==='true'/);
 assert.match(route,/env\.VITAL_CRM_STAFF_ENABLED==='true'/);
 assert.match(route,/env\.VERCEL_ENV==='production'/);
 assert.match(route,/origin!==target\.origin/);
 assert.match(route,/access\.role!=='owner'\|\|userId!==organization\.ownerUserId/);
 assert.match(route,/\.eq\('email',email\)\.eq\('status','draft'\)/);
 assert.match(route,/if\(draft\.activated_at\)throw fail/);
 assert.match(route,/db\.auth\.admin\.inviteUserByEmail\(email/);
 assert.match(route,/db\.auth\.admin\.listUsers\(/);
 assert.match(route,/String\(user\?\.email\|\|''\)\.toLowerCase\(\)!==email/);
 assert.match(route,/crm_vital_activate_draft_member_atomic/);
 assert.match(route,/INVITE_REDIRECT='https:\/\/social-hub-gui\.vercel\.app\/equipe'/);
 assert.match(management,/VITAL_CRM_INVITES_ENABLED==='true'/);
 assert.match(ui,/window\.confirm\('Liberar o acesso de '/);
 assert.match(ui,/\/api\/crm\/vital\/team\/invite/);
 assert.match(ui,/data\.invitationsEnabled\?/);
});

test('first invite shows individual password form without elevating role from metadata',()=>{
 const page=source('app/equipe/page.js');
 const route=source('app/api/crm/vital/team/invite/route.js');
 assert.match(page,/supabase\.auth\.getUser\(\)/);
 assert.match(page,/requires_password_setup/);
 assert.match(page,/supabase\.auth\.updateUser\(\{/);
 assert.match(page,/password:newPassword,data:\{requires_password_setup:false\}/);
 assert.match(page,/newPassword\.length<12/);
 assert.match(page,/<VitalCRMReal embedded\/>/);
 assert.match(route,/data:\{display_name:draft\.display_name,requires_password_setup:true\}/);
});


test('existing team members recover password via Supabase, without exposing whether email exists',()=>{
 const gate=source('app/CloudGate.js');
 assert.match(gate,/supabase\.auth\.resetPasswordForEmail\(to,\{/);
 assert.match(gate,/redirectTo:window\.location\.origin\+'\/equipe'/);
 assert.match(gate,/_event==='PASSWORD_RECOVERY'/);
 assert.match(gate,/supabase\.auth\.updateUser\(\{/);
 assert.match(gate,/if\(newRecoveryPassword\.length<12\|\|newRecoveryPassword!==confirmRecoveryPassword\)/);
 assert.match(gate,/Se houver uma conta para este e-mail/);
 assert.match(gate,/Esqueci minha senha/);
});
