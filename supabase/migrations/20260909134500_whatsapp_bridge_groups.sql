create table if not exists public.whatsapp_groups (
  id uuid primary key default gen_random_uuid(),
  jid text not null unique,
  name text not null,
  description text,
  participant_count integer not null default 0,
  owner_jid text,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_groups_name_idx
  on public.whatsapp_groups(name);

alter table public.whatsapp_groups enable row level security;

revoke all on table public.whatsapp_groups from anon, authenticated;
grant all on table public.whatsapp_groups to service_role;
