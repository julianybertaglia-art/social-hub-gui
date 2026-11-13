-- One intentional new TikTok transfer task may reuse each archived file, without
-- reuploading it from the browser. Existing posts remain unchanged.
alter table public.multichannel_posts
  add column if not exists reused_from_post_id uuid
  references public.multichannel_posts(id) on delete set null;
create unique index if not exists one_tiktok_reuse_per_source
  on public.multichannel_posts(reused_from_post_id)
  where reused_from_post_id is not null;