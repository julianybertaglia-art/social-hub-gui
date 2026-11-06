import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

test('exercise Vital comment receipt migration in an isolated Postgres container', { timeout: 180000 }, async () => {
  const name = 'vital-ig-migration-' + process.pid;
  const run = (args, options = {}) => execFileSync('docker', args, { encoding: 'utf8', ...options });
  try {
    run(['run', '-d', '--rm', '--name', name, '-e', 'POSTGRES_PASSWORD=local-test-only', 'postgres:17-alpine'], { timeout: 120000 });
    let ready = false;
    for (let i = 0; i < 45; i++) {
      try {
        run(['exec', name, 'pg_isready', '-U', 'postgres'], { stdio: 'ignore', timeout: 3000 });
        ready = true;
        break;
      } catch { await delay(1000); }
    }
    assert.equal(ready, true, 'isolated Postgres became ready');
    const migration = readFileSync('supabase/migrations/20261106044551_vital_marmore_atomic_claim.sql', 'utf8');
    const setup = `
      create role anon;
      create role authenticated;
      create role service_role;
      create table public.workspace_meta_connections (id uuid primary key);
      insert into public.workspace_meta_connections values ('11111111-1111-4111-8111-111111111111');
    `;
    const checks = `
      insert into public.vital_instagram_comment_deliveries
        (comment_id,connection_id,workspace_id,account_id,status)
        values ('1234567890123','11111111-1111-4111-8111-111111111111','vital-decor','17841439121395170','processing');
      do $$
      begin
        begin
          insert into public.vital_instagram_comment_deliveries
            (comment_id,workspace_id,account_id,status)
            values ('1234567890123','vital-decor','17841439121395170','processing');
          raise exception 'duplicate was accepted';
        exception when unique_violation then null; end;
        begin
          update public.vital_instagram_comment_deliveries set status='sent' where comment_id='1234567890123';
          raise exception 'sent status without Meta message id was accepted';
        exception when check_violation then null; end;
        begin
          insert into public.vital_instagram_comment_deliveries
            (comment_id,workspace_id,account_id,status)
            values ('1234567890999','another-workspace','17841439121395170','processing');
          raise exception 'another workspace was accepted';
        exception when check_violation then null; end;
        if has_table_privilege('anon','public.vital_instagram_comment_deliveries','SELECT') then
          raise exception 'anonymous role can read receipts';
        end if;
        if not has_table_privilege('service_role','public.vital_instagram_comment_deliveries','INSERT') then
          raise exception 'service role cannot insert receipts';
        end if;
        if not (select relrowsecurity from pg_class where oid='public.vital_instagram_comment_deliveries'::regclass) then
          raise exception 'row level security is disabled';
        end if;
      end $$;
      update public.vital_instagram_comment_deliveries
        set status='sent',meta_message_id='confirmed-meta-message' where comment_id='1234567890123';
      delete from public.workspace_meta_connections where id='11111111-1111-4111-8111-111111111111';
      do $$ begin
        if not exists (select 1 from public.vital_instagram_comment_deliveries
          where comment_id='1234567890123' and connection_id is null and status='sent') then
          raise exception 'receipt was not preserved on connection deletion';
        end if;
      end $$;
    `;
    run(['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
      input: setup + migration + checks, timeout: 30000,
    });
    console.log('VITAL_MARMORE_ISOLATED_POSTGRES_OK');
  } finally {
    try { run(['rm', '-f', name], { stdio: 'ignore', timeout: 10000 }); } catch {}
  }
});
