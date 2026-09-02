create table public.instagram_audio_automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null default 'argo-audio' check (char_length(trim(slug)) > 0),
  name text not null check (char_length(trim(name)) > 0),
  ig_account_id text not null check (ig_account_id ~ '^[0-9]+$'),
  comment_keyword text not null check (char_length(trim(comment_keyword)) > 0),
  public_reply text not null check (char_length(trim(public_reply)) > 0),
  prompt_message text not null check (char_length(trim(prompt_message)) > 0),
  quick_reply_title text not null check (char_length(trim(quick_reply_title)) between 1 and 20),
  quick_reply_payload text not null unique check (char_length(quick_reply_payload) between 1 and 1000),
  audio_bucket text not null check (char_length(trim(audio_bucket)) > 0),
  audio_path text not null check (audio_path ~ '\.m4a$'),
  whatsapp_message text not null check (char_length(trim(whatsapp_message)) > 0),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

create index instagram_audio_automations_active_account_idx
  on public.instagram_audio_automations (ig_account_id)
  where active;

alter table public.instagram_audio_automations enable row level security;
revoke all on public.instagram_audio_automations from anon, authenticated;
grant all on public.instagram_audio_automations to service_role;

create table public.instagram_audio_deliveries (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.instagram_audio_automations(id) on delete cascade,
  recipient_id text not null check (recipient_id ~ '^[0-9]+$'),
  incoming_message_id text not null check (char_length(trim(incoming_message_id)) > 0),
  status text not null check (status in ('sending', 'audio_sent', 'sent', 'partial', 'failed')),
  audio_message_id text,
  whatsapp_message_id text,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (automation_id, recipient_id),
  unique (incoming_message_id)
);

create index instagram_audio_deliveries_automation_created_idx
  on public.instagram_audio_deliveries (automation_id, created_at desc);

alter table public.instagram_audio_deliveries enable row level security;
revoke all on public.instagram_audio_deliveries from anon, authenticated;
grant all on public.instagram_audio_deliveries to service_role;

insert into public.instagram_audio_automations (
  user_id,
  slug,
  name,
  ig_account_id,
  comment_keyword,
  public_reply,
  prompt_message,
  quick_reply_title,
  quick_reply_payload,
  audio_bucket,
  audio_path,
  whatsapp_message,
  active
)
select
  tests.user_id,
  'argo-audio',
  'ARGO — Áudio do Gui',
  tests.ig_account_id,
  'ARGO',
  'Te chamei no Direct 👊',
  E'Vi seu comentário sobre o ARGO 👊\n\nO Gui deixou um áudio rápido explicando. Toca em “Ouvir áudio do Gui” aqui embaixo.\n\nSe o botão não aparecer, responde: OUVIR ÁUDIO DO GUI.',
  'Ouvir áudio do Gui',
  'argo-audio-' || replace(gen_random_uuid()::text, '-', ''),
  'instagram-audio-tests',
  tests.audio_path,
  'Quer mais informações sobre o ARGO? Chama a equipe no WhatsApp: (11) 92399-0244 👊',
  false
from public.instagram_audio_tests as tests
where tests.status = 'sent'
  and tests.ig_account_id ~ '^[0-9]+$'
  and tests.audio_path ~ '\.m4a$'
order by tests.sent_at desc nulls last, tests.created_at desc
limit 1
on conflict (user_id, slug) do nothing;

comment on table public.instagram_audio_automations is
  'Private, owner-scoped configuration for the ARGO Instagram audio automation. Writes only happen through authenticated server routes.';

comment on table public.instagram_audio_deliveries is
  'Private delivery ledger for the ARGO Instagram audio automation. The unique recipient claim prevents duplicate audio sends.';
