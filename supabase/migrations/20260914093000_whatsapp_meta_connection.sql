create table if not exists public.whatsapp_meta_connections (
  id text primary key default 'primary',
  waba_id text not null,
  phone_number_id text not null,
  access_token text not null,
  display_phone_number text,
  verified_name text,
  coexistence boolean not null default true,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_meta_connections enable row level security;

comment on table public.whatsapp_meta_connections is 'Server-only WhatsApp Cloud API connection created through Meta Embedded Signup.';
