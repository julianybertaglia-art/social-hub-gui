begin;
do $$
begin
  if has_table_privilege('anon','public.crm_vital_store_request_limits','select') or
     has_table_privilege('authenticated','public.crm_vital_store_request_limits','select') then
    raise exception 'Public role can read limiter';
  end if;
  if not has_table_privilege('service_role','public.crm_vital_store_request_limits','select') or
     not has_table_privilege('service_role','public.crm_vital_store_request_limits','insert') or
     not has_table_privilege('service_role','public.crm_vital_store_request_limits','update') then
    raise exception 'Service role lacks limiter table privileges';
  end if;
  if has_function_privilege('anon','public.crm_vital_store_request_claim(uuid)','execute') or
     has_function_privilege('authenticated','public.crm_vital_store_request_claim(uuid)','execute') or
     has_function_privilege('anon','public.crm_vital_store_request_backoff(uuid)','execute') or
     has_function_privilege('authenticated','public.crm_vital_store_request_backoff(uuid)','execute') then
    raise exception 'Public role can execute limiter functions';
  end if;
  if not has_function_privilege('service_role','public.crm_vital_store_request_claim(uuid)','execute') or
     not has_function_privilege('service_role','public.crm_vital_store_request_backoff(uuid)','execute') then
    raise exception 'Service role lacks limiter function privileges';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.crm_vital_store_request_limits'::regclass) or
     exists(select 1 from pg_proc where oid in
       ('public.crm_vital_store_request_claim(uuid)'::regprocedure,'public.crm_vital_store_request_backoff(uuid)'::regprocedure)
       and prosecdef) then
    raise exception 'Expected RLS and security invoker functions';
  end if;
end $$;

set local role anon;
do $$ begin
  begin
    perform public.crm_vital_store_request_claim('11111111-1111-4111-8111-111111111111');
    raise exception 'anon claim unexpectedly permitted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin
    perform public.crm_vital_store_request_backoff('11111111-1111-4111-8111-111111111111');
    raise exception 'authenticated backoff unexpectedly permitted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role service_role;
do $$
declare a uuid:='11111111-1111-4111-8111-111111111111';
        b uuid:='22222222-2222-4222-8222-222222222222';
begin
  if public.crm_vital_store_request_claim(a) is distinct from true then raise exception 'First claim failed'; end if;
  if public.crm_vital_store_request_claim(a) is distinct from false then raise exception 'Immediate duplicate succeeded'; end if;
  if public.crm_vital_store_request_claim(b) is distinct from true then raise exception 'Other organization blocked'; end if;
  update public.crm_vital_store_request_limits set next_request_at=clock_timestamp()-interval '1 second' where organization_id=a;
  if public.crm_vital_store_request_backoff(a) is distinct from true then raise exception 'Backoff failed'; end if;
  if public.crm_vital_store_request_claim(a) is distinct from false then raise exception 'Backoff did not block'; end if;
  update public.crm_vital_store_request_limits set blocked_until=clock_timestamp()-interval '1 second' where organization_id=a;
  if public.crm_vital_store_request_claim(a) is distinct from true then raise exception 'Claim after backoff failed'; end if;
end $$;
rollback;
