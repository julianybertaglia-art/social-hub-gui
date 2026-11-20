-- DRAFT ONLY: NOT APPLIED TO PRODUCTION.
-- Must be reviewed and applied with an approved Supabase migration.
-- One row per store/order/fulfillment/stage, never one row per duplicate webhook request.
create table if not exists public.crm_vital_order_notice_ledger (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.crm_organizations(id) on delete cascade,
 store_id text not null check (store_id ~ '^\\d{3,20}$'),
 order_id text not null check (order_id ~ '^\\d{1,20}$'),
 fulfillment_id text not null default '',
 stage text not null check (stage in (
   'paid','preparing','packed','partially_shipped','shipped','pickup_ready','pickup_collected','delivered','cancelled'
 )),
 dedupe_key text not null check (length(dedupe_key)=64),
 state text not null default 'prepared' check (state in (
   'prepared','approved','sending','sent','skipped','failed'
 )),
 -- No customer name, phone, address, or message body is stored here.
 template_name text,
 consent_status text not null default 'unknown' check(consent_status in ('unknown','verified','denied')),
 approved_by uuid,
 approved_at timestamptz,
 sent_at timestamptz,
 meta_message_id text,
 failure_code text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (store_id,order_id,fulfillment_id,stage),
 unique (dedupe_key)
);
create index if not exists crm_vital_order_notice_ledger_org_created_idx
 on public.crm_vital_order_notice_ledger (organization_id,created_at desc);
alter table public.crm_vital_order_notice_ledger enable row level security;
revoke all on public.crm_vital_order_notice_ledger from public, anon, authenticated;
grant select, insert, update on public.crm_vital_order_notice_ledger to service_role;
-- No policies for anon/authenticated: all operations must pass the authenticated backend
-- and explicit organization membership verification before using service_role.
-- Atomically claim dedupe_key with INSERT ... ON CONFLICT DO NOTHING.
-- Dispatch must additionally require an approved template, verified consent, authorization,
-- rate limits, and idempotent sending status. No automatic sending code is included.
