-- Credentials and OAuth sessions are server-only. The browser receives metadata
-- through the authenticated Vital Decor API; no client role may read these tables.
create table public.workspace_meta_connections (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id),
  workspace_id text not null check (workspace_id = 'vital-decor'),
  platform text not null check (platform in ('instagram', 'whatsapp')),
  external_account_id text not null check (external_account_id ~ '^[0-9]{5,40}$'),
  access_token text not null,
  page_id text,
  waba_id text,
  username text,
  display_name text not null,
  picture_url text,
  display_phone_number text,
  state text not null check (state in ('pending_subscription', 'connected')),
  automatic_replies_enabled boolean not null default false check (not automatic_replies_enabled),
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, workspace_id, platform),
  unique (platform, external_account_id),
  unique (id, owner_user_id),
  check (platform <> 'instagram' or external_account_id <> '17841401155694295'),
  check (platform <> 'whatsapp' or waba_id is not null)
);

create table public.workspace_meta_connection_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id),
  workspace_id text not null check (workspace_id = 'vital-decor'),
  platform text not null check (platform in ('instagram', 'whatsapp')),
  candidates jsonb not null check (jsonb_typeof(candidates) = 'array'),
  status text not null check (status in ('prepared', 'consuming', 'consumed', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at > created_at)
);
create index workspace_meta_session_owner_expiry on public.workspace_meta_connection_sessions (owner_user_id, expires_at);

create table public.workspace_meta_messages (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null,
  owner_user_id uuid not null,
  meta_message_id text not null,
  contact_wa_id text not null,
  profile_name text,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_type text not null,
  body text not null default '',
  status text not null,
  raw_payload jsonb not null default '{}',
  sent_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (connection_id, owner_user_id) references public.workspace_meta_connections (id, owner_user_id),
  unique (connection_id, meta_message_id)
);
create index workspace_meta_messages_owner_sent on public.workspace_meta_messages (owner_user_id, sent_at desc);
create index workspace_meta_connections_waba on public.workspace_meta_connections (waba_id) where platform = 'whatsapp';

alter table public.workspace_meta_connections enable row level security;
alter table public.workspace_meta_connection_sessions enable row level security;
alter table public.workspace_meta_messages enable row level security;
revoke all on public.workspace_meta_connections, public.workspace_meta_connection_sessions, public.workspace_meta_messages from public, anon, authenticated;
grant all on public.workspace_meta_connections, public.workspace_meta_connection_sessions, public.workspace_meta_messages to service_role;
