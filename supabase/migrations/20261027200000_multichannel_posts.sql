-- Separate, owner-scoped publishing jobs; never interact with existing automations.
create table if not exists public.multichannel_posts (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 workspace_id text not null check (workspace_id = 'gui-nonato'),
 title text not null check (char_length(title) between 1 and 100),
 caption text not null default '' check (char_length(caption)<=2200),
 storage_path text not null,
 mime_type text not null check (mime_type='video/mp4'),
 size_bytes bigint not null check (size_bytes>0 and size_bytes<=50000000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists multichannel_posts_owner_created_idx on public.multichannel_posts(owner_user_id, created_at desc);
create table if not exists public.multichannel_post_targets (
 id uuid primary key default gen_random_uuid(),
 post_id uuid not null references public.multichannel_posts(id) on delete cascade,
 platform text not null check(platform in ('instagram','youtube','tiktok')),
 state text not null default 'ready' check (state in
   ('ready','sending','processing','published','private','pending_approval','failed','unknown')),
 external_id text,
 error_message text,
 updated_at timestamptz not null default now(),
 unique(post_id,platform)
);
create index if not exists multichannel_targets_post_idx on public.multichannel_post_targets(post_id);
alter table public.multichannel_posts enable row level security;
alter table public.multichannel_post_targets enable row level security;
revoke all on public.multichannel_posts from public,anon,authenticated;
revoke all on public.multichannel_post_targets from public,anon,authenticated;
grant all on public.multichannel_posts to service_role;
grant all on public.multichannel_post_targets to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('tide-multichannel-videos','tide-multichannel-videos',false,50000000,array['video/mp4'])
on conflict(id) do update set public=false,file_size_limit=50000000,allowed_mime_types=array['video/mp4'];