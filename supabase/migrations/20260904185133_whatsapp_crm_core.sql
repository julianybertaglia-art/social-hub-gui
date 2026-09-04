create table if not exists public.whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  wa_id text not null unique,
  phone text,
  profile_name text,
  source text not null default 'WhatsApp',
  stage text not null default 'Novo lead',
  tags text[] not null default '{}',
  notes text,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  meta_message_id text unique,
  contact_id uuid not null references public.whatsapp_contacts(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  message_type text not null default 'text',
  body text,
  status text,
  raw_payload jsonb,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_contacts_last_message_at_idx
  on public.whatsapp_contacts(last_message_at desc nulls last);
create index if not exists whatsapp_contacts_stage_idx
  on public.whatsapp_contacts(stage);
create index if not exists whatsapp_messages_contact_sent_at_idx
  on public.whatsapp_messages(contact_id, sent_at desc);

alter table public.whatsapp_contacts enable row level security;
alter table public.whatsapp_messages enable row level security;

revoke all on table public.whatsapp_contacts from anon, authenticated;
revoke all on table public.whatsapp_messages from anon, authenticated;
grant all on table public.whatsapp_contacts to service_role;
grant all on table public.whatsapp_messages to service_role;
