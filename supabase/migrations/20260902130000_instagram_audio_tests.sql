create table public.instagram_audio_tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Áudio do Gui',
  duration_seconds numeric not null check (duration_seconds > 0),
  audio_base64 text check (length(audio_base64) <= 2800000),
  audio_path text,
  ig_account_id text,
  keyword text unique,
  status text not null default 'draft' check (status in (
    'draft', 'preparing', 'prepare_failed', 'ready', 'sending', 'sent', 'send_failed', 'cancelled'
  )),
  prepared_at timestamptz,
  expires_at timestamptz,
  recipient_id text,
  incoming_message_id text,
  sent_message_id text,
  sent_at timestamptz,
  error_message text,
  visual_result text check (visual_result in ('voice_bubble', 'file', 'not_received')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index instagram_audio_tests_user_created_idx
  on public.instagram_audio_tests (user_id, created_at desc);

alter table public.instagram_audio_tests enable row level security;
revoke all on public.instagram_audio_tests from anon, authenticated;
grant select on public.instagram_audio_tests to authenticated;
grant all on public.instagram_audio_tests to service_role;

create policy "Owner can read audio tests"
  on public.instagram_audio_tests for select to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.instagram_audio_tests is
  'Owner-scoped, single-use Instagram audio tests. Writes require authenticated server handlers. Audio is staged privately and moved to private Storage on preparation.';
