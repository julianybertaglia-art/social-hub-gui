-- Review and apply in verified environment before enabling dispatch.
create table if not exists public.crm_vital_payment_recovery (
 organization_id uuid not null references public.crm_organizations(id) on delete cascade,
 store_id text not null check (store_id ~ '^[0-9]{3,20}$'),
 order_id text not null check (order_id ~ '^[0-9]{1,20}$'),
 stage text not null check (stage in ('pending_email','pending_whatsapp')),
 state text not null check (state in ('sending','sent','skipped','uncertain')),
 provider_message_id text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key (organization_id,store_id,order_id,stage)
);
alter table public.crm_vital_payment_recovery enable row level security;
revoke all on public.crm_vital_payment_recovery from public, anon, authenticated;
grant select,insert,update on public.crm_vital_payment_recovery to service_role;
-- Never automatically reclaim a sending/uncertain row: reconcile with provider first.
