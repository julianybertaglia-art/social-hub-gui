-- OAuth do YouTube: escopos separados do Instagram/WhatsApp e credenciais acessíveis somente pelo servidor.
create table if not exists public.youtube_oauth_pending (
  state_hash text primary key check (state_hash ~ '^[a-f0-9]{64}$'),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id text not null default 'gui-nonato' check (workspace_id = 'gui-nonato'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index if not exists youtube_oauth_pending_expiration_idx on public.youtube_oauth_pending (expires_at);

create table if not exists public.youtube_channel_connections (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id text not null default 'gui-nonato' check (workspace_id = 'gui-nonato'),
  channel_id text not null,
  channel_title text not null,
  channel_thumbnail text,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text not null,
  access_expires_at timestamptz not null,
  oauth_scopes text[] not null default array[]::text[],
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, workspace_id)
);
create index if not exists youtube_connections_channel_idx on public.youtube_channel_connections(channel_id);

alter table public.youtube_oauth_pending enable row level security;
alter table public.youtube_channel_connections enable row level security;
revoke all on public.youtube_oauth_pending, public.youtube_channel_connections from public, anon, authenticated;
grant all on public.youtube_oauth_pending, public.youtube_channel_connections to service_role;