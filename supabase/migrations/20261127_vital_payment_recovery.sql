create table if not exists public.crm_vital_payment_recovery (
  organization_id uuid not null references public.crm_organizations(id) on delete cascade,
  store_id text not null check (store_id ~ '^[0-9]{3,20}$'),
  entity_type text not null check (entity_type in ('order', 'checkout')),
  entity_id text not null check (entity_id ~ '^[0-9]{1,20}$'),
  stage text not null check (stage in (
    'payment_email_30m',
    'payment_whatsapp_210m',
    'checkout_email_6h',
    'checkout_whatsapp'
  )),
  state text not null check (state in ('sending', 'sent', 'skipped', 'uncertain')),
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, store_id, entity_type, entity_id, stage)
);

create index if not exists crm_vital_payment_recovery_history_idx
  on public.crm_vital_payment_recovery (organization_id, store_id, created_at desc);

alter table public.crm_vital_payment_recovery enable row level security;
revoke all on public.crm_vital_payment_recovery from public, anon, authenticated;
grant select, insert, update on public.crm_vital_payment_recovery to service_role;

comment on table public.crm_vital_payment_recovery is
  'At-most-once recovery dispatch ledger for Vital Decor order and checkout reminders. Sending/uncertain entries are never automatically reclaimed.';
