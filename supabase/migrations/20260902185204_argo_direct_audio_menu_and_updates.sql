alter table public.instagram_audio_automations
  add column direct_keyword text not null default 'ARGO'
    check (char_length(trim(direct_keyword)) between 1 and 20),
  add column menu_message text not null default E'Como você quer continuar? 👇\n\nSe não puder participar da Imersão, você também pode receber as novidades do Argo.'
    check (char_length(trim(menu_message)) between 1 and 640),
  add column menu_buttons jsonb not null default '[
    {"type":"web_url","title":"Conhecer a Imersão","url":"https://imersao.guinonato.com/"},
    {"type":"web_url","title":"Só novidades do Argo","url":"https://social-hub-gui.vercel.app/argo/novidades"},
    {"type":"web_url","title":"Falar com a equipe","url":"https://wa.me/5511923990244?text=Oi%21%20Vim%20pelo%20Direct%20do%20Gui%20e%20quero%20mais%20informa%C3%A7%C3%B5es%20sobre%20o%20Argo."}
  ]'::jsonb
    check (jsonb_typeof(menu_buttons) = 'array' and jsonb_array_length(menu_buttons) = 3),
  add column flow_version integer not null default 2 check (flow_version > 0);

alter table public.instagram_audio_deliveries
  add column flow_version integer not null default 1 check (flow_version > 0),
  add column menu_message_id text;

alter table public.instagram_audio_deliveries
  drop constraint instagram_audio_deliveries_automation_id_recipient_id_key,
  add constraint instagram_audio_deliveries_recipient_flow_key
    unique (automation_id, recipient_id, flow_version);

update public.instagram_audio_automations
set name = 'ARGO — Direct, áudio e opções', updated_at = now()
where slug = 'argo-audio';

create table public.argo_update_contacts (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.instagram_audio_automations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 100),
  whatsapp text not null check (whatsapp ~ '^55[1-9][0-9](9[0-9]{8}|[2-5][0-9]{7})$'),
  consent_text text not null check (char_length(trim(consent_text)) between 1 and 200),
  consented_at timestamptz not null default now(),
  source text not null default 'argo_updates_form' check (source = 'argo_updates_form'),
  created_at timestamptz not null default now(),
  unique (automation_id, whatsapp)
);

create index argo_update_contacts_owner_created_idx
  on public.argo_update_contacts (user_id, consented_at desc);

alter table public.argo_update_contacts enable row level security;
revoke all on public.argo_update_contacts from anon, authenticated;
grant all on public.argo_update_contacts to service_role;

comment on table public.argo_update_contacts is
  'Contacts who explicitly requested Argo updates. Server inserts validated signups; owner reads require authenticated Hub access.';

comment on table public.instagram_audio_deliveries is
  'Private delivery ledger. One audio/menu per recipient per flow version; unique incoming messages prevent replay across versions.';
