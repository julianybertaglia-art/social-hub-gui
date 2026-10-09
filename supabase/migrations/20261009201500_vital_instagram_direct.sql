-- Enable opted-in Direct auto-responses only for the Vital Decor Instagram.
alter table public.workspace_meta_connections
  drop constraint if exists workspace_meta_connections_automatic_replies_enabled_check;
alter table public.workspace_meta_connections
  add constraint workspace_meta_connections_instagram_auto_only
  check (not automatic_replies_enabled or (platform = 'instagram' and workspace_id = 'vital-decor' and state = 'connected'));

create table public.vital_instagram_direct_sessions (
  connection_id uuid not null references public.workspace_meta_connections(id) on delete cascade,
  sender_ig_id text not null check (sender_ig_id ~ '^[0-9]{5,40}$'),
  last_inbound_at timestamptz not null default now(),
  last_auto_replied_at timestamptz not null default now(),
  last_message_id text not null,
  primary key (connection_id, sender_ig_id)
);

alter table public.vital_instagram_direct_sessions enable row level security;
revoke all on public.vital_instagram_direct_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.vital_instagram_direct_sessions to service_role;

-- Atomic claim: one welcome reply per conversation, restarted only after 24 hours of silence.
create function public.claim_vital_instagram_direct_reply(
  p_connection_id uuid, p_sender_ig_id text, p_message_id text
) returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare claimed boolean;
begin
  if p_sender_ig_id !~ '^[0-9]{5,40}$' or length(coalesce(p_message_id, '')) = 0 then
    return false;
  end if;
  insert into public.vital_instagram_direct_sessions (
    connection_id, sender_ig_id, last_inbound_at, last_auto_replied_at, last_message_id
  ) values (p_connection_id, p_sender_ig_id, now(), now(), left(p_message_id, 500))
  on conflict do nothing returning true into claimed;
  if coalesce(claimed, false) then return true; end if;

  update public.vital_instagram_direct_sessions
  set last_inbound_at = now(), last_auto_replied_at = now(), last_message_id = left(p_message_id, 500)
  where connection_id = p_connection_id and sender_ig_id = p_sender_ig_id
    and last_inbound_at < now() - interval '24 hours'
    and last_message_id <> left(p_message_id, 500)
  returning true into claimed;
  if coalesce(claimed, false) then return true; end if;

  update public.vital_instagram_direct_sessions
  set last_inbound_at = now(), last_message_id = left(p_message_id, 500)
  where connection_id = p_connection_id and sender_ig_id = p_sender_ig_id
    and last_message_id <> left(p_message_id, 500);
  return false;
end;
$$;
revoke all on function public.claim_vital_instagram_direct_reply(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_vital_instagram_direct_reply(uuid, text, text) to service_role;
