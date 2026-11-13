-- Durable, Vital-only claim and receipt for comment-to-Direct delivery.
-- The primary key prevents concurrent webhook deliveries from sending twice.
create table public.vital_instagram_comment_deliveries (
  comment_id text primary key check (comment_id ~ '^[0-9]{5,50}$'),
  connection_id uuid references public.workspace_meta_connections(id) on delete set null,
  workspace_id text not null check (workspace_id = 'vital-decor'),
  account_id text not null check (account_id ~ '^[0-9]{5,40}$'),
  status text not null check (status in ('processing', 'sent', 'failed')),
  meta_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vital_instagram_comment_delivery_sent_receipt
    check (status <> 'sent' or length(coalesce(meta_message_id, '')) > 0)
);

create index vital_instagram_comment_deliveries_connection_idx
  on public.vital_instagram_comment_deliveries (connection_id);
create index vital_instagram_comment_deliveries_account_created_idx
  on public.vital_instagram_comment_deliveries (account_id, created_at desc);

alter table public.vital_instagram_comment_deliveries enable row level security;
revoke all on table public.vital_instagram_comment_deliveries from public, anon, authenticated;
grant select, insert, update on table public.vital_instagram_comment_deliveries to service_role;
