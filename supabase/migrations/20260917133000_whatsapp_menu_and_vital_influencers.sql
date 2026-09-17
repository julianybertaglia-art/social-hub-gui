create table if not exists public.influencer_applications (
  id uuid primary key default gen_random_uuid(),
  public_token uuid not null default gen_random_uuid() unique,
  contact_id uuid not null unique references public.whatsapp_contacts(id) on delete cascade,
  wa_id text not null,
  profile_name text,
  creator_name text,
  email text,
  city_state text,
  tiktok_url text,
  instagram_url text,
  niche text,
  followers bigint,
  average_views bigint,
  average_likes bigint,
  average_comments bigint,
  posts_per_week integer,
  brazil_audience_percent integer,
  affiliate_experience boolean,
  live_experience boolean,
  content_commitment boolean not null default false,
  top_video_urls text[] not null default '{}',
  motivation text,
  score integer,
  score_breakdown jsonb not null default '{}',
  qualification text,
  status text not null default 'draft',
  review_status text not null default 'pending',
  review_notes text,
  source text not null default 'whatsapp_menu',
  consent_text text,
  consented_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint influencer_applications_status_check
    check (status in ('draft', 'submitted')),
  constraint influencer_applications_qualification_check
    check (qualification is null or qualification in ('prequalified', 'review', 'low_fit')),
  constraint influencer_applications_review_status_check
    check (review_status in ('pending', 'approved', 'declined')),
  constraint influencer_applications_score_check
    check (score is null or score between 0 and 100),
  constraint influencer_applications_brazil_audience_check
    check (brazil_audience_percent is null or brazil_audience_percent between 0 and 100),
  constraint influencer_applications_nonnegative_metrics_check
    check (
      (followers is null or followers >= 0)
      and (average_views is null or average_views >= 0)
      and (average_likes is null or average_likes >= 0)
      and (average_comments is null or average_comments >= 0)
      and (posts_per_week is null or posts_per_week >= 0)
    )
);

create index if not exists influencer_applications_triage_idx
  on public.influencer_applications(status, qualification, score desc, submitted_at desc);
create index if not exists influencer_applications_review_idx
  on public.influencer_applications(review_status, submitted_at desc);

create table if not exists public.whatsapp_automation_sessions (
  contact_id uuid primary key references public.whatsapp_contacts(id) on delete cascade,
  current_topic text,
  state text not null default 'new',
  influencer_application_id uuid references public.influencer_applications(id) on delete set null,
  menu_sent_at timestamptz,
  last_interaction_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_automation_sessions_topic_idx
  on public.whatsapp_automation_sessions(current_topic, last_interaction_at desc);

create table if not exists public.whatsapp_automation_events (
  message_id text primary key,
  contact_id uuid not null references public.whatsapp_contacts(id) on delete cascade,
  status text not null default 'processing',
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint whatsapp_automation_events_status_check
    check (status in ('processing', 'processed', 'ignored', 'failed'))
);

create index if not exists whatsapp_automation_events_contact_idx
  on public.whatsapp_automation_events(contact_id, created_at desc);

alter table public.influencer_applications enable row level security;
alter table public.whatsapp_automation_sessions enable row level security;
alter table public.whatsapp_automation_events enable row level security;

revoke all on table public.influencer_applications from anon, authenticated;
revoke all on table public.whatsapp_automation_sessions from anon, authenticated;
revoke all on table public.whatsapp_automation_events from anon, authenticated;

grant all on table public.influencer_applications to service_role;
grant all on table public.whatsapp_automation_sessions to service_role;
grant all on table public.whatsapp_automation_events to service_role;

comment on table public.influencer_applications is
  'Private Vital Decor TikTok creator applications, submitted through one-time WhatsApp links and ranked server-side.';
comment on table public.whatsapp_automation_sessions is
  'Private state for the official WhatsApp routing menu.';
comment on table public.whatsapp_automation_events is
  'Idempotency ledger for inbound WhatsApp automation events.';
