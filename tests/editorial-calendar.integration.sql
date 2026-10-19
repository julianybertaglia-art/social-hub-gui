-- Run with the database administrator. Every fixture rolls back.
begin;
do $$
declare
  owner_id uuid;
  fixture jsonb := '{"id":"__editorial_test_original","title":"__editorial_test_original","date":"2026-10-27","time":"","status":"Roteiro","format":"Reel","brief":{"script":"Original briefing"}}';
  imported integer;
  affected integer;
begin
  select user_id into strict owner_id from public.content_items where title='__SOCIAL_HUB_STATE__' order by updated_at desc limit 1;
  imported := public.import_editorial_posts(owner_id,'gui-nonato','__editorial_test_import_1',jsonb_build_array(fixture));
  assert imported=1, 'first import must insert';
  imported := public.import_editorial_posts(owner_id,'gui-nonato','__editorial_test_import_1',jsonb_build_array(fixture));
  assert imported=0, 'same import must be idempotent';
  imported := public.import_editorial_posts(owner_id,'gui-nonato','__editorial_test_import_2',jsonb_build_array(fixture || '{"status":"Ideia","date":"2026-11-01"}'));
  assert imported=0, 'another device must not overwrite an existing ID';
  assert (select payload=fixture from public.editorial_posts where owner_user_id=owner_id and workspace_id='gui-nonato' and post_id=fixture->>'id'), 'dates, status and brief must be unchanged';
  imported := public.import_editorial_posts(owner_id,'gui-nonato','__editorial_test_import_3',jsonb_build_array(fixture || '{"id":"__editorial_test_other_id","title":"  __EDITORIAL_TEST_ORIGINAL  "}'));
  assert imported=0, 'normalized title must prevent duplicate imports';
  assert (select jsonb_array_length(original_posts)=1 from public.editorial_imports where owner_user_id=owner_id and workspace_id='gui-nonato' and import_key='__editorial_test_import_3'), 'conflicting local copy must remain in backup';
  imported := public.import_editorial_posts(owner_id,'vital-decor','__editorial_test_import_1',jsonb_build_array(fixture));
  assert imported=1, 'workspace must be isolated';
  update public.editorial_posts set payload=payload || '{"status":"Em criação"}',revision=2
    where owner_user_id=owner_id and workspace_id='gui-nonato' and post_id=fixture->>'id' and revision=1;
  get diagnostics affected=row_count;
  assert affected=1, 'current revision must update';
  update public.editorial_posts set payload=fixture,revision=2
    where owner_user_id=owner_id and workspace_id='gui-nonato' and post_id=fixture->>'id' and revision=1;
  get diagnostics affected=row_count;
  assert affected=0, 'stale revision must not overwrite';
  update public.editorial_posts set deleted_at=now(),revision=3
    where owner_user_id=owner_id and workspace_id='gui-nonato' and post_id=fixture->>'id';
  imported := public.import_editorial_posts(owner_id,'gui-nonato','__editorial_test_import_4',jsonb_build_array(fixture));
  assert imported=0, 'browser backups cannot resurrect deleted posts';
  assert not has_table_privilege('anon','public.editorial_posts','select'), 'anonymous access must be denied';
  assert not has_table_privilege('authenticated','public.editorial_posts','update'), 'direct client writes must be denied';
  assert not has_function_privilege('authenticated','public.import_editorial_posts(uuid,text,text,jsonb)','execute'), 'client cannot impersonate an owner during import';
  assert (select relrowsecurity from pg_class where oid='public.editorial_posts'::regclass), 'row-level security must be enabled';
end;
$$;
-- A foreign authenticated identity sees no records, even without an owner filter.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}',true);
do $$ begin
  assert (select count(*)=0 from public.editorial_posts), 'cross-owner reads must be denied';
  assert (select count(*)=0 from public.editorial_imports), 'cross-owner backups must be denied';
end; $$;
reset role;
rollback;
select 'PASS: imports, backups, workspace isolation, revision conflicts, tombstones and RLS' as result;
