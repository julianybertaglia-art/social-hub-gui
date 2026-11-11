-- Store read request limiter. Review and validate before applying to production.
create table public.crm_vital_store_request_limits (
  organization_id uuid primary key references public.crm_organizations(id) on delete cascade,
  next_request_at timestamptz not null default '-infinity',
  blocked_until timestamptz not null default '-infinity'
);
alter table public.crm_vital_store_request_limits enable row level security;
revoke all on public.crm_vital_store_request_limits from public, anon, authenticated;
grant select, insert, update on public.crm_vital_store_request_limits to service_role;

create function public.crm_vital_store_request_claim(p_organization_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare claimed boolean;
begin
  insert into public.crm_vital_store_request_limits(organization_id)
    values (p_organization_id) on conflict (organization_id) do nothing;
  update public.crm_vital_store_request_limits
    set next_request_at = clock_timestamp() + interval '2 seconds'
    where organization_id = p_organization_id
      and next_request_at <= clock_timestamp()
      and blocked_until <= clock_timestamp()
    returning true into claimed;
  return coalesce(claimed,false);
end;
$$;

create function public.crm_vital_store_request_backoff(p_organization_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.crm_vital_store_request_limits(organization_id,blocked_until)
    values (p_organization_id,clock_timestamp() + interval '60 seconds')
    on conflict (organization_id) do update
      set blocked_until=greatest(public.crm_vital_store_request_limits.blocked_until,
                                 clock_timestamp() + interval '60 seconds');
  return true;
end;
$$;

revoke all on function public.crm_vital_store_request_claim(uuid) from public, anon, authenticated;
revoke all on function public.crm_vital_store_request_backoff(uuid) from public, anon, authenticated;
grant execute on function public.crm_vital_store_request_claim(uuid) to service_role;
grant execute on function public.crm_vital_store_request_backoff(uuid) to service_role;
