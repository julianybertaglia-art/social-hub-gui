create table if not exists public.whatsapp_ai_agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  mode text not null default 'off' check (mode in ('off','copilot','auto')),
  model text not null default 'gpt-5.6-terra',
  assistant_name text not null default 'Assistente do Gui',
  tone text not null default 'Natural, direto, cordial e comercial sem parecer robô.',
  instructions text,
  auto_send_min_confidence numeric(4,3) not null default 0.900,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_ai_knowledge (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'Geral',
  title text not null,
  content text not null,
  active boolean not null default true,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references public.whatsapp_contacts(id) on delete cascade,
  inbound_message_id uuid references public.whatsapp_messages(id) on delete set null,
  model text not null,
  reply_text text not null,
  intent text,
  lead_temperature text check (lead_temperature is null or lead_temperature in ('frio','morno','quente')),
  confidence numeric(4,3),
  should_escalate boolean not null default false,
  escalation_reason text,
  suggested_stage text,
  suggested_tags text[] not null default '{}',
  used boolean,
  final_text text,
  created_at timestamptz not null default now(),
  feedback_at timestamptz
);

create index if not exists whatsapp_ai_knowledge_user_active_priority_idx
  on public.whatsapp_ai_knowledge(user_id, active, priority, created_at);
create index if not exists whatsapp_ai_suggestions_contact_created_idx
  on public.whatsapp_ai_suggestions(contact_id, created_at desc);

alter table public.whatsapp_ai_agents enable row level security;
alter table public.whatsapp_ai_knowledge enable row level security;
alter table public.whatsapp_ai_suggestions enable row level security;

revoke all on table public.whatsapp_ai_agents from anon, authenticated;
revoke all on table public.whatsapp_ai_knowledge from anon, authenticated;
revoke all on table public.whatsapp_ai_suggestions from anon, authenticated;
grant all on table public.whatsapp_ai_agents to service_role;
grant all on table public.whatsapp_ai_knowledge to service_role;
grant all on table public.whatsapp_ai_suggestions to service_role;
