-- Explicit CRM conversation status independent of the legacy Argo routing status.
-- Resolved conversations are reopened in the API when a newer customer message arrives.
create table if not exists public.crm_vital_conversation_states(
 organization_id uuid not null references public.crm_organizations(id) on delete cascade,
 connection_id uuid not null references public.workspace_meta_connections(id),
 owner_user_id uuid not null references auth.users(id),
 contact_wa_id text not null check (contact_wa_id ~ '^[0-9]{8,15}$'),
 status text not null check (status in ('open','resolved')),
 updated_at timestamptz not null default now(),
 updated_by uuid not null references auth.users(id),
 primary key (organization_id,connection_id,contact_wa_id)
);
create index if not exists crm_vital_conversation_states_owner_idx
  on public.crm_vital_conversation_states (organization_id,updated_at desc);
create table if not exists public.crm_vital_status_audit(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.crm_organizations(id) on delete cascade,
 connection_id uuid not null references public.workspace_meta_connections(id),
 contact_wa_id text not null,
 old_status text,
 new_status text not null check(new_status in ('open','resolved')),
 updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.crm_vital_conversation_states enable row level security;
alter table public.crm_vital_status_audit enable row level security;
revoke all on public.crm_vital_conversation_states,public.crm_vital_status_audit from anon,authenticated;
comment on table public.crm_vital_conversation_states is 'Explicit resolved/open CRM state, writable only by sector-authorized server endpoints';
