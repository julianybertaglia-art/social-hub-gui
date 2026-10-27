-- TikTok OAuth connection, isolated to the Gui Nonato workspace.
create table if not exists public.tiktok_oauth_pending (
 state_hash text primary key,
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 workspace_id text not null default 'gui-nonato' check(workspace_id='gui-nonato'),
 expires_at timestamptz not null,
 consumed_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists tiktok_oauth_pending_expiration_idx on public.tiktok_oauth_pending(expires_at);
create table if not exists public.tiktok_account_connections (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 workspace_id text not null default 'gui-nonato' check(workspace_id='gui-nonato'),
 open_id text not null check(length(open_id) between 4 and 512),
 display_name text not null default '',
 avatar_url text,
 oauth_scopes text[] not null default array[]::text[],
 access_token_ciphertext text not null,
 refresh_token_ciphertext text not null,
 access_expires_at timestamptz not null,
 refresh_expires_at timestamptz,
 connected_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(owner_user_id,workspace_id)
);
create index if not exists tiktok_connections_owner on public.tiktok_account_connections(owner_user_id);
alter table public.tiktok_oauth_pending enable row level security;
alter table public.tiktok_account_connections enable row level security;
revoke all on public.tiktok_oauth_pending from public, anon, authenticated;
revoke all on public.tiktok_account_connections from public, anon, authenticated;
grant all on public.tiktok_oauth_pending to service_role;
grant all on public.tiktok_account_connections to service_role;