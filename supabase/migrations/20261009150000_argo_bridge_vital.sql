-- Argo bridge: encrypted transport over HTTPS, one-time bearer keys stored only as SHA-256.
-- No Meta tokens are sent to Argo; all access is restricted to the Vital WhatsApp connection.
create table if not exists public.vital_whatsapp_argo_keys (
 id uuid primary key default gen_random_uuid(),
 connection_id uuid not null references public.workspace_meta_connections(id) on delete cascade,
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 agent text not null check(agent in ('andrey','vitor')),
 label text not null default '',
 prefix text not null unique,
 secret_hash text not null unique,
 expires_at timestamptz not null,
 revoked_at timestamptz,
 last_used_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.vital_whatsapp_sector_settings (
 connection_id uuid not null references public.workspace_meta_connections(id) on delete cascade,
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 sector text not null check(sector in ('comercial_vital','bluetti','vtx','pos_venda','atacado','afiliados')),
 default_assignee text not null default 'tide' check(default_assignee in ('tide','andrey','vitor')),
 updated_at timestamptz not null default now(),
 primary key(connection_id,sector)
);
create table if not exists public.vital_whatsapp_assignments (
 connection_id uuid not null references public.workspace_meta_connections(id) on delete cascade,
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 contact_wa_id text not null check(contact_wa_id ~ '^[0-9]{8,15}$'),
 sector text not null check(sector in ('comercial_vital','bluetti','vtx','pos_venda','atacado','afiliados')),
 assigned_to text not null default 'tide' check(assigned_to in ('tide','andrey','vitor')),
 status text not null default 'open' check(status in ('open','waiting','closed')),
 assigned_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(connection_id,contact_wa_id)
);
create table if not exists public.vital_whatsapp_argo_sends (
 id uuid primary key default gen_random_uuid(),
 connection_id uuid not null references public.workspace_meta_connections(id) on delete cascade,
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 contact_wa_id text not null check(contact_wa_id ~ '^[0-9]{8,15}$'),
 agent text not null check(agent in ('andrey','vitor')),
 idempotency_key text not null check(length(idempotency_key) between 8 and 100),
 status text not null default 'processing' check(status in ('processing','accepted','uncertain')),
 meta_message_id text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(connection_id,agent,idempotency_key)
);
create index if not exists vital_whatsapp_assignments_agent_index on public.vital_whatsapp_assignments (connection_id,assigned_to,status,updated_at desc);
create index if not exists vital_whatsapp_argo_sends_recent_index on public.vital_whatsapp_argo_sends (connection_id,agent,created_at desc);
alter table public.vital_whatsapp_argo_keys enable row level security;
alter table public.vital_whatsapp_sector_settings enable row level security;
alter table public.vital_whatsapp_assignments enable row level security;
alter table public.vital_whatsapp_argo_sends enable row level security;
revoke all on public.vital_whatsapp_argo_keys,public.vital_whatsapp_sector_settings,public.vital_whatsapp_assignments,public.vital_whatsapp_argo_sends from anon,authenticated;
grant all on public.vital_whatsapp_argo_keys,public.vital_whatsapp_sector_settings,public.vital_whatsapp_assignments,public.vital_whatsapp_argo_sends to service_role;
