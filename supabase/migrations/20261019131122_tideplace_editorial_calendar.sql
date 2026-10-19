-- Each editorial item belongs to one authenticated TidePlace owner and workspace.
-- The original JSON preserves dates, statuses, briefs, numeric IDs and extra fields.
create table public.editorial_posts (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id text not null check (workspace_id in ('gui-nonato', 'vital-decor')),
  post_id text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload->>'id' = post_id and length(btrim(payload->>'title')) > 0),
  title_key text generated always as (lower(regexp_replace(btrim(payload->>'title'), '\s+', ' ', 'g'))) stored,
  date_key text generated always as (coalesce(payload->>'date', '')) stored,
  revision integer not null default 1 check (revision > 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_user_id, workspace_id, post_id)
);

create unique index editorial_posts_active_title_date
  on public.editorial_posts(owner_user_id, workspace_id, title_key, date_key) where deleted_at is null;
create index editorial_posts_calendar
  on public.editorial_posts(owner_user_id, workspace_id, date_key, created_at, post_id) where deleted_at is null;

create table public.editorial_imports (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id text not null check (workspace_id in ('gui-nonato', 'vital-decor')),
  import_key text not null,
  original_posts jsonb not null check (jsonb_typeof(original_posts) = 'array'),
  imported_count integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (owner_user_id, workspace_id, import_key)
);

alter table public.editorial_posts enable row level security;
alter table public.editorial_imports enable row level security;
revoke all on public.editorial_posts, public.editorial_imports from anon, authenticated;
grant select on public.editorial_posts, public.editorial_imports to authenticated;
grant all on public.editorial_posts, public.editorial_imports to service_role;
create policy editorial_posts_read_own on public.editorial_posts for select to authenticated
  using (owner_user_id = (select auth.uid()));
create policy editorial_imports_read_own on public.editorial_imports for select to authenticated
  using (owner_user_id = (select auth.uid()));

-- Only the authenticated, owner-scoped server API can call this function.
-- The archive and inserts commit together, and concurrent devices share a lock.
create function public.import_editorial_posts(p_owner_id uuid, p_workspace text, p_import_key text, p_posts jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  item jsonb;
  inserted integer := 0;
  affected integer;
begin
  if p_owner_id is null or p_workspace not in ('gui-nonato', 'vital-decor')
    or p_import_key is null or p_import_key = '' or jsonb_typeof(p_posts) is distinct from 'array'
    or jsonb_array_length(p_posts) > 10000 then
    raise exception 'Invalid editorial import';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner_id::text || ':' || p_workspace, 0));
  insert into public.editorial_imports(owner_user_id, workspace_id, import_key, original_posts)
    values (p_owner_id, p_workspace, p_import_key, p_posts) on conflict do nothing;
  if not found then return 0; end if;

  for item in select value from pg_catalog.jsonb_array_elements(p_posts) loop
    if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'id', '') = ''
      or coalesce(btrim(item->>'title'), '') = '' then
      raise exception 'Incomplete editorial item; original data remains untouched';
    end if;
    -- Existing edits always win. Include tombstones so refreshes cannot restore deletions.
    if exists (select 1 from public.editorial_posts p where p.owner_user_id = p_owner_id
      and p.workspace_id = p_workspace and (p.post_id = item->>'id'
        or p.title_key = lower(regexp_replace(btrim(item->>'title'), '\s+', ' ', 'g')))) then continue; end if;
    insert into public.editorial_posts(owner_user_id, workspace_id, post_id, payload)
      values (p_owner_id, p_workspace, item->>'id', item) on conflict do nothing;
    get diagnostics affected = row_count;
    inserted := inserted + affected;
  end loop;
  update public.editorial_imports set imported_count = inserted
    where owner_user_id = p_owner_id and workspace_id = p_workspace and import_key = p_import_key;
  return inserted;
end;
$$;
revoke all on function public.import_editorial_posts(uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.import_editorial_posts(uuid,text,text,jsonb) to service_role;

-- Backfill ONLY the latest snapshot per owner, never resurrect historical/deleted plans.
-- Keep the old snapshot unchanged and archive each source array before importing it.
do $$
declare
  state record;
  snapshot jsonb;
  source_posts jsonb;
  workspace text;
  storage_key text;
begin
  for state in select distinct on (user_id) user_id, description from public.content_items
    where title = '__SOCIAL_HUB_STATE__' order by user_id, updated_at desc, id loop
    snapshot := state.description::jsonb;
    foreach workspace in array array['gui-nonato','vital-decor'] loop
      storage_key := case when workspace = 'gui-nonato' then 'guihub-posts' else 'guihub-posts:vital-decor' end;
      if snapshot->'data'->>storage_key is not null then
        source_posts := (snapshot->'data'->>storage_key)::jsonb;
        perform public.import_editorial_posts(state.user_id, workspace, 'legacy-cloud-snapshot:v1', source_posts);
      end if;
    end loop;
  end loop;
end;
$$;
