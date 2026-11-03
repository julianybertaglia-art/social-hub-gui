-- Vital Decor CRM: invite drafts only. This does NOT create Auth accounts,
-- issue access tokens, send emails, or grant any membership.
create table if not exists public.crm_vital_invite_drafts (
  organization_id uuid not null references public.crm_organizations(id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[a-z0-9.!#$%&''*+/=?^`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$'),
  display_name text not null check (char_length(display_name) between 2 and 100),
  requested_role text not null check (requested_role in ('agent','supervisor')),
  status text not null default 'draft' check (status='draft'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id,email)
);
create table if not exists public.crm_vital_invite_draft_queues (
  organization_id uuid not null,
  email text not null,
  queue_code text not null,
  primary key (organization_id,email,queue_code),
  foreign key (organization_id,email) references public.crm_vital_invite_drafts(organization_id,email) on delete cascade,
  foreign key (organization_id,queue_code) references public.crm_vital_queues(organization_id,queue_code) on delete cascade
);
alter table public.crm_vital_invite_drafts enable row level security;
alter table public.crm_vital_invite_draft_queues enable row level security;
revoke all on public.crm_vital_invite_drafts, public.crm_vital_invite_draft_queues from anon,authenticated;
-- Private server-side draft records. No RLS policies for browser roles:
-- a future verified owner-only endpoint may read them using service role.
comment on table public.crm_vital_invite_drafts is
  'Private planned access only; does not create/login/email-invite a user.';
comment on table public.crm_vital_invite_draft_queues is
  'Requested queue access for an invitation draft, not an active grant.';
