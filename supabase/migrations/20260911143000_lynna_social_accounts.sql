create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  platform text not null default 'instagram',
  platform_account_id text,
  storage_key text not null,
  username text,
  name text not null,
  profile_picture_url text,
  connection_status text not null default 'setup_needed',
  credential_source text not null default 'none',
  is_default boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_user_id, storage_key)
);

create unique index if not exists social_accounts_platform_identity_idx
  on public.social_accounts(owner_user_id, platform, platform_account_id)
  where platform_account_id is not null;

create unique index if not exists social_accounts_one_default_idx
  on public.social_accounts(owner_user_id)
  where is_default = true;

alter table public.social_accounts enable row level security;
grant select, insert, update, delete on table public.social_accounts to authenticated;
revoke all on table public.social_accounts from anon;

drop policy if exists social_accounts_select_own on public.social_accounts;
create policy social_accounts_select_own on public.social_accounts for select to authenticated using (auth.uid() = owner_user_id);
drop policy if exists social_accounts_insert_own on public.social_accounts;
create policy social_accounts_insert_own on public.social_accounts for insert to authenticated with check (auth.uid() = owner_user_id);
drop policy if exists social_accounts_update_own on public.social_accounts;
create policy social_accounts_update_own on public.social_accounts for update to authenticated using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists social_accounts_delete_own on public.social_accounts;
create policy social_accounts_delete_own on public.social_accounts for delete to authenticated using (auth.uid() = owner_user_id);
