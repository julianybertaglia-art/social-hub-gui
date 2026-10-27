-- Primeira etapa de publicação multicanal: upload privado de Shorts pelo YouTube.
-- Arquivos ficam em bucket privado, assinados por servidor e nunca acessíveis anonimamente.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tide-youtube-videos', 'tide-youtube-videos', false, 50000000, array['video/mp4','video/quicktime','video/webm'])
on conflict (id) do nothing;

create table if not exists public.youtube_video_uploads (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 workspace_id text not null default 'gui-nonato' check (workspace_id='gui-nonato'),
 title text not null check (char_length(title) between 1 and 100),
 description text not null default '' check (char_length(description) <= 5000),
 storage_path text not null unique,
 mime_type text not null check (mime_type in ('video/mp4','video/quicktime','video/webm')),
 size_bytes bigint not null check (size_bytes>0 and size_bytes<=50000000),
 state text not null default 'awaiting_file' check (state in ('awaiting_file','uploading_to_youtube','uploaded_private','failed')),
 youtube_video_id text,
 error_message text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists youtube_video_uploads_owner_date on public.youtube_video_uploads(owner_user_id,created_at desc);
alter table public.youtube_video_uploads enable row level security;
revoke all on public.youtube_video_uploads from public, anon, authenticated;
grant all on public.youtube_video_uploads to service_role;