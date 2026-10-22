-- Public applications enter through the bounded server-side form only.
create table public.consultoria_applications (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  campaign text not null check (length(campaign) between 1 and 80),
  name text not null check (length(name) between 2 and 120),
  phone text not null check (phone ~ '^55[1-9][0-9][0-9]{8,9}$'),
  instagram text not null check (instagram ~ '^[a-z0-9_][a-z0-9_.]{0,29}$'),
  experience text not null check (experience in ('zero','starting','seller')),
  revenue text not null check (revenue in ('none','up_to_10k','10k_50k','50k_100k','100k_500k','500k_plus')),
  product text not null check (length(product) between 2 and 300),
  store_url text check (length(store_url) <= 500 and store_url ~ '^https://'),
  challenge text not null check (length(challenge) between 15 and 1500),
  recording text not null check (recording in ('yes','discuss')),
  segment text not null check (segment in ('beginner','seller')),
  consent_text text not null,
  consent_at timestamptz not null,
  marketing_opt_in boolean not null default false,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  review_status text not null default 'pending' check (review_status in ('pending','shortlisted','selected','contacted','scheduled','completed','declined')),
  review_notes text not null default '' check (length(review_notes) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign,phone),
  check ((experience = 'zero' and segment = 'beginner' and revenue = 'none') or (experience <> 'zero' and segment = 'seller'))
);
create index consultoria_applications_owner_idx on public.consultoria_applications (owner_id,campaign,created_at desc);
create index consultoria_applications_rate_idx on public.consultoria_applications (request_hash,created_at desc);
alter table public.consultoria_applications enable row level security;
-- No public access to submitted data, including after a form submission.
revoke all on public.consultoria_applications from public,anon,authenticated;
grant select,insert,update,delete on public.consultoria_applications to service_role;
comment on table public.consultoria_applications is 'Gui Nonato consultation candidacies. Public form writes and owner-authorized review use server API only.';
