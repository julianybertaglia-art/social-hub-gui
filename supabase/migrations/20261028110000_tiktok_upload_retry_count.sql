-- Bound explicit retries for uploads with no TikTok publish_id.
alter table public.multichannel_post_targets
  add column if not exists retry_count integer not null default 0
  check (retry_count between 0 and 2);