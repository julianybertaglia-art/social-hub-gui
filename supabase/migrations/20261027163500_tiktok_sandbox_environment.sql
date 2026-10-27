alter table public.tiktok_oauth_pending
  add column if not exists environment text not null default 'production'
  check(environment in ('production','sandbox'));
alter table public.tiktok_account_connections
  add column if not exists environment text not null default 'production'
  check(environment in ('production','sandbox'));
-- Existing connection is intentionally one per workspace and administrator.
-- A confirmed sandbox authorization replaces a previously saved TikTok authorization,
-- and the UI explicitly shows the active environment. Other platforms are untouched.