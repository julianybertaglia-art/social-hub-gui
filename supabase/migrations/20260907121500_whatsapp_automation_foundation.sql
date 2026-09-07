create table if not exists public.whatsapp_automation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  enabled boolean not null default false,
  trigger_type text not null default 'contains'
    check (trigger_type in ('contains','exact','starts_with','any')),
  keywords text[] not null default '{}',
  reply_text text not null,
  set_stage text,
  add_tags text[] not null default '{}',
  priority integer not null default 100,
  stop_after_match boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_automation_runs (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.whatsapp_automation_rules(id) on delete cascade,
  inbound_message_id uuid not null references public.whatsapp_messages(id) on delete cascade,
  outbound_meta_message_id text,
  status text not null default 'pending'
    check (status in ('pending','sent','failed')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rule_id, inbound_message_id)
);

create index if not exists whatsapp_automation_rules_enabled_priority_idx
  on public.whatsapp_automation_rules(enabled, priority, created_at);
create index if not exists whatsapp_automation_runs_message_idx
  on public.whatsapp_automation_runs(inbound_message_id);

alter table public.whatsapp_automation_rules enable row level security;
alter table public.whatsapp_automation_runs enable row level security;

revoke all on table public.whatsapp_automation_rules from anon, authenticated;
revoke all on table public.whatsapp_automation_runs from anon, authenticated;
grant all on table public.whatsapp_automation_rules to service_role;
grant all on table public.whatsapp_automation_runs to service_role;
