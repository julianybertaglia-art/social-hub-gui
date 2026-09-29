create table if not exists public.instagram_flow_responses (
  id bigint generated always as identity primary key,
  flow_id text not null,
  flow_name text,
  sender_id text not null,
  button_id text not null,
  button_label text not null,
  parent_node_id text,
  created_at timestamptz not null default now()
);

create index if not exists instagram_flow_responses_flow_created_idx
  on public.instagram_flow_responses (flow_id, created_at desc);

alter table public.instagram_flow_responses enable row level security;
revoke all on public.instagram_flow_responses from anon, authenticated;
grant all on public.instagram_flow_responses to service_role;

comment on table public.instagram_flow_responses is
  'Private ledger of choices made inside TidePlace Instagram automation flows.';
