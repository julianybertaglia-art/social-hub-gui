-- Idempotency for keyword-triggered Instagram Direct on Gui Nonato.
-- Private server-side receipts; never coupled to the comment-response table.
create table if not exists public.instagram_direct_keyword_deliveries (
  account_id text not null check (account_id ~ '^[0-9]{5,40}$'),
  message_id text not null check (length(message_id) between 1 and 500),
  sender_id text not null check (sender_id ~ '^[0-9]{5,40}$'),
  flow_id text not null,
  keyword text not null,
  status text not null default 'processing' check (status in ('processing','sent','failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id,message_id)
);
alter table public.instagram_direct_keyword_deliveries enable row level security;
revoke all on public.instagram_direct_keyword_deliveries from public, anon, authenticated;
grant select,insert,update,delete on public.instagram_direct_keyword_deliveries to service_role;
create index if not exists instagram_direct_keyword_deliveries_created_idx
  on public.instagram_direct_keyword_deliveries (created_at desc);
