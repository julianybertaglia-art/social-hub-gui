-- Additional CRM safeguards and the first private notes/MIA storage.
-- The migration adds no employee members, invitations or queue grants.

alter table public.crm_organization_members
  add column if not exists can_transfer boolean not null default false,
  add column if not exists display_name text;
alter table public.crm_vital_invite_drafts
  add column if not exists can_transfer boolean not null default false;
update public.crm_vital_invite_drafts set can_transfer=false
  where requested_role='supervisor' and organization_id in (
    select id from public.crm_organizations where workspace_code='vital-decor'
  );
update public.crm_organization_members set can_transfer=false
  where role='supervisor' and organization_id in (
    select id from public.crm_organizations where workspace_code='vital-decor'
  );

update public.crm_organization_members m set display_name='Juliany'
from public.crm_organizations o
where m.organization_id=o.id and o.workspace_code='vital-decor'
  and m.role='owner' and m.display_name is null;

-- Fix tenant scoping in the original metadata policies.
drop policy if exists crm_org_sectors_member_read on public.crm_organization_sectors;
create policy crm_org_sectors_member_read on public.crm_organization_sectors
  for select to authenticated using (exists (
    select 1 from public.crm_organization_members m
    where m.organization_id=crm_organization_sectors.organization_id
      and m.user_id=(select auth.uid()) and m.status='active'
  ));
drop policy if exists crm_org_member_sectors_self_read on public.crm_organization_member_sectors;
create policy crm_org_member_sectors_self_read on public.crm_organization_member_sectors
  for select to authenticated using (
    user_id=(select auth.uid()) and exists (
      select 1 from public.crm_organization_members m
      where m.organization_id=crm_organization_member_sectors.organization_id
        and m.user_id=(select auth.uid()) and m.status='active'
    )
  );

create table if not exists public.crm_vital_conversation_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crm_organizations(id) on delete cascade,
  connection_id uuid not null references public.workspace_meta_connections(id),
  owner_user_id uuid not null references auth.users(id),
  contact_wa_id text not null check(contact_wa_id ~ '^[0-9]{8,15}$'),
  body text not null check(char_length(body) between 1 and 2000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists crm_vital_conversation_notes_contact_idx
  on public.crm_vital_conversation_notes(organization_id,connection_id,contact_wa_id,created_at desc);
alter table public.crm_vital_conversation_notes enable row level security;
revoke all on public.crm_vital_conversation_notes from anon,authenticated;
comment on table public.crm_vital_conversation_notes is
  'Internal CRM notes. Only authorized server routes may read or write them; never sent to WhatsApp.';

create table if not exists public.crm_vital_reply_locks (
  organization_id uuid not null references public.crm_organizations(id) on delete cascade,
  connection_id uuid not null references public.workspace_meta_connections(id),
  contact_wa_id text not null check(contact_wa_id ~ '^[0-9]{8,15}$'),
  lease_id uuid not null unique,
  locked_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  primary key(organization_id,connection_id,contact_wa_id)
);
alter table public.crm_vital_reply_locks enable row level security;
revoke all on public.crm_vital_reply_locks from anon,authenticated;

create table if not exists public.crm_vital_mia_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crm_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_code text not null default 'vital-decor' check(workspace_code in ('vital-decor','gui-nonato')),
  title text not null default 'Nova conversa' check(char_length(title) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,organization_id,user_id)
);
create index if not exists crm_vital_mia_threads_user_idx
  on public.crm_vital_mia_threads(organization_id,user_id,workspace_code,updated_at desc);
create table if not exists public.crm_vital_mia_messages (
  id uuid primary key default gen_random_uuid(),
  message_order bigint generated always as identity,
  thread_id uuid not null,
  organization_id uuid not null,
  user_id uuid not null,
  role text not null check(role in ('user','assistant')),
  content text not null check(char_length(content) between 1 and 8000),
  created_at timestamptz not null default now(),
  foreign key(thread_id,organization_id,user_id)
    references public.crm_vital_mia_threads(id,organization_id,user_id) on delete cascade
);
create index if not exists crm_vital_mia_messages_thread_idx
  on public.crm_vital_mia_messages(organization_id,user_id,thread_id,message_order desc);
alter table public.crm_vital_mia_threads enable row level security;
alter table public.crm_vital_mia_messages enable row level security;
revoke all on public.crm_vital_mia_threads,public.crm_vital_mia_messages from anon,authenticated;
comment on table public.crm_vital_mia_messages is
  'Private per-user MIA history; direct browser access is denied and service routes enforce the authenticated user id.';

create table if not exists public.crm_vital_mia_request_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crm_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists crm_vital_mia_request_log_window_idx
  on public.crm_vital_mia_request_log(organization_id,user_id,created_at desc);
alter table public.crm_vital_mia_request_log enable row level security;
revoke all on public.crm_vital_mia_request_log from anon,authenticated;

-- Service-only server actions use the service role, which must also have SQL
-- privileges when RLS is enabled. No direct authenticated write is granted.
grant all on public.crm_organizations,public.crm_organization_members,
  public.crm_organization_sectors,public.crm_organization_member_sectors,
  public.crm_vital_queues,public.crm_vital_member_queues,
  public.crm_vital_queue_assignments,public.crm_vital_transfer_audit,
  public.crm_vital_conversation_states,public.crm_vital_status_audit,
  public.crm_vital_invite_drafts,public.crm_vital_invite_draft_queues,
  public.crm_vital_conversation_notes,public.crm_vital_reply_locks,
  public.crm_vital_mia_threads,public.crm_vital_mia_messages,
  public.crm_vital_mia_request_log to service_role;

-- Agent transfers need an explicit persisted grant. Supervisors stay read-only.
create or replace function public.crm_vital_transfer_atomic(
 p_org uuid,p_conn uuid,p_owner uuid,p_phone text,p_to_queue text,
 p_expected_from text,p_expected_override_at timestamptz,p_actor uuid
)
returns text language plpgsql security invoker set search_path=public as $$
declare
 v_role text;v_can_transfer boolean;v_existing public.crm_vital_queue_assignments%rowtype;
 v_found boolean:=false;
begin
 if p_phone !~ '^[0-9]{8,15}$' then raise exception 'Invalid contact' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtext(p_org::text||':'||p_conn::text),hashtext(p_phone));
 if not exists(select 1 from public.crm_organizations o where o.id=p_org
      and o.owner_user_id=p_owner and o.workspace_code='vital-decor')
   or not exists(select 1 from public.workspace_meta_connections c where c.id=p_conn
      and c.owner_user_id=p_owner and c.workspace_id='vital-decor'
      and c.platform='whatsapp' and c.state='connected')
 then raise exception 'Workspace or connection is invalid' using errcode='42501'; end if;
 select m.role,m.can_transfer into v_role,v_can_transfer
  from public.crm_organization_members m where m.organization_id=p_org
   and m.user_id=p_actor and m.status='active';
 if v_role='owner' and p_actor<>p_owner then raise exception 'Invalid owner' using errcode='42501'; end if;
 if v_role is null or (v_role<>'owner' and (v_role<>'agent' or not v_can_transfer))
 then raise exception 'Member is not authorized to transfer' using errcode='42501'; end if;
 if exists(select 1 from public.crm_vital_reply_locks l where l.organization_id=p_org
   and l.connection_id=p_conn and l.contact_wa_id=p_phone and l.expires_at>now())
 then raise exception 'Reply is in progress' using errcode='55P03'; end if;
 if v_role<>'owner' and (p_expected_from is null or not exists(
   select 1 from public.crm_vital_member_queues g where g.organization_id=p_org
    and g.user_id=p_actor and g.queue_code=p_expected_from))
 then raise exception 'Conversation is outside allowed queues' using errcode='42501'; end if;
 if not exists(select 1 from public.crm_vital_queues q where q.organization_id=p_org
   and q.queue_code=p_to_queue) then raise exception 'Unknown destination queue' using errcode='22023'; end if;
 select * into v_existing from public.crm_vital_queue_assignments x
  where x.organization_id=p_org and x.connection_id=p_conn and x.contact_wa_id=p_phone for update;
 v_found:=found;
 if v_found then
   if p_expected_override_at is distinct from v_existing.updated_at
     or p_expected_from is distinct from v_existing.queue_code
   then raise exception 'Conversation assignment changed concurrently' using errcode='40001'; end if;
 elsif p_expected_override_at is not null then
   raise exception 'Conversation assignment changed concurrently' using errcode='40001';
 end if;
 insert into public.crm_vital_queue_assignments(organization_id,connection_id,owner_user_id,
   contact_wa_id,queue_code,source,changed_by,updated_at)
 values(p_org,p_conn,p_owner,p_phone,p_to_queue,'manual',p_actor,now())
 on conflict(organization_id,connection_id,contact_wa_id) do update set
   queue_code=excluded.queue_code,source='manual',changed_by=excluded.changed_by,updated_at=excluded.updated_at;
 insert into public.crm_vital_transfer_audit(organization_id,connection_id,contact_wa_id,
   from_queue,to_queue,changed_by) values(p_org,p_conn,p_phone,p_expected_from,p_to_queue,p_actor);
 return p_to_queue;
end;
$$;
revoke all on function public.crm_vital_transfer_atomic(uuid,uuid,uuid,text,text,text,timestamptz,uuid)
 from public,anon,authenticated;
grant execute on function public.crm_vital_transfer_atomic(uuid,uuid,uuid,text,text,text,timestamptz,uuid)
 to service_role;

create or replace function public.crm_vital_set_status_atomic(
 p_org uuid,p_conn uuid,p_owner uuid,p_phone text,p_source_queue text,
 p_new_status text,p_actor uuid,p_expected_updated_at timestamptz
)
returns text language plpgsql security invoker set search_path=public as $$
declare v_role text;v_state public.crm_vital_conversation_states%rowtype;
 v_found boolean:=false;v_prior text;v_current_queue text;v_has_queue_override boolean:=false;
begin
 if p_phone !~ '^[0-9]{8,15}$' or p_new_status not in ('open','resolved')
 then raise exception 'Invalid conversation status' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtext(p_org::text||':'||p_conn::text),hashtext(p_phone));
 if exists(select 1 from public.crm_vital_reply_locks l where l.organization_id=p_org
   and l.connection_id=p_conn and l.contact_wa_id=p_phone and l.expires_at>now())
 then raise exception 'Reply is in progress' using errcode='55P03'; end if;
 if not exists(select 1 from public.crm_organizations o where o.id=p_org
     and o.owner_user_id=p_owner and o.workspace_code='vital-decor')
   or not exists(select 1 from public.workspace_meta_connections c where c.id=p_conn
     and c.owner_user_id=p_owner and c.state='connected' and c.workspace_id='vital-decor'
     and c.platform='whatsapp')
 then raise exception 'Workspace not authorized' using errcode='42501'; end if;
 select role into v_role from public.crm_organization_members m where m.organization_id=p_org
  and m.user_id=p_actor and m.status='active';
 if v_role is null or v_role not in ('owner','agent') or (v_role='owner' and p_actor<>p_owner)
 then raise exception 'Not authorized to change conversation status' using errcode='42501'; end if;
 if not exists(select 1 from public.crm_vital_queues q where q.organization_id=p_org
   and q.queue_code=p_source_queue) or (v_role='agent' and not exists(
     select 1 from public.crm_vital_member_queues g where g.organization_id=p_org
      and g.user_id=p_actor and g.queue_code=p_source_queue))
 then raise exception 'Source queue outside access' using errcode='42501'; end if;
 select queue_code into v_current_queue from public.crm_vital_queue_assignments a
  where a.organization_id=p_org and a.connection_id=p_conn and a.contact_wa_id=p_phone;
 v_has_queue_override:=found;
 if v_has_queue_override and v_current_queue is distinct from p_source_queue
 then raise exception 'Conversation queue changed' using errcode='42501'; end if;
 select * into v_state from public.crm_vital_conversation_states s where s.organization_id=p_org
  and s.connection_id=p_conn and s.contact_wa_id=p_phone for update;
 v_found:=found;
 if v_found then
  if v_state.updated_at is distinct from p_expected_updated_at
  then raise exception 'Status changed concurrently' using errcode='40001'; end if;
  v_prior:=v_state.status;
 elsif p_expected_updated_at is not null then
  raise exception 'Status changed concurrently' using errcode='40001';
 end if;
 if v_prior is not distinct from p_new_status then return p_new_status; end if;
 insert into public.crm_vital_conversation_states(organization_id,connection_id,owner_user_id,
   contact_wa_id,status,updated_by,updated_at)
 values(p_org,p_conn,p_owner,p_phone,p_new_status,p_actor,now())
 on conflict(organization_id,connection_id,contact_wa_id) do update set
   status=excluded.status,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 insert into public.crm_vital_status_audit(organization_id,connection_id,contact_wa_id,
   old_status,new_status,updated_by) values(p_org,p_conn,p_phone,v_prior,p_new_status,p_actor);
 return p_new_status;
end;
$$;
revoke all on function public.crm_vital_set_status_atomic(uuid,uuid,uuid,text,text,text,uuid,timestamptz)
 from public,anon,authenticated;
grant execute on function public.crm_vital_set_status_atomic(uuid,uuid,uuid,text,text,text,uuid,timestamptz)
 to service_role;

create or replace function public.crm_vital_claim_reply_atomic(
 p_org uuid,p_conn uuid,p_owner uuid,p_phone text,p_queue text,p_actor uuid
)
returns uuid language plpgsql security invoker set search_path=public as $$
declare v_role text;v_lease uuid;
 v_override text;v_has_override boolean:=false;
begin
 if p_phone !~ '^[0-9]{8,15}$' then raise exception 'Invalid contact' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtext(p_org::text||':'||p_conn::text),hashtext(p_phone));
 if not exists(select 1 from public.crm_organizations o where o.id=p_org
      and o.owner_user_id=p_owner and o.workspace_code='vital-decor')
   or not exists(select 1 from public.workspace_meta_connections c where c.id=p_conn
      and c.owner_user_id=p_owner and c.workspace_id='vital-decor'
      and c.platform='whatsapp' and c.state='connected')
 then raise exception 'Workspace or connection is invalid' using errcode='42501'; end if;
 select role into v_role from public.crm_organization_members m where m.organization_id=p_org
  and m.user_id=p_actor and m.status='active';
 if v_role is null or v_role not in ('owner','agent')
   or (v_role='owner' and p_actor<>p_owner)
   or (v_role='agent' and (p_queue is null or not exists(
      select 1 from public.crm_vital_member_queues g where g.organization_id=p_org
       and g.user_id=p_actor and g.queue_code=p_queue)))
 then raise exception 'Member is not authorized to reply' using errcode='42501'; end if;
 if exists(select 1 from public.vital_whatsapp_assignments a where a.owner_user_id=p_owner
   and a.connection_id=p_conn and a.contact_wa_id=p_phone
   and coalesce(a.status,'')<>'closed' and a.assigned_to is not null and a.assigned_to<>'tide')
 then raise exception 'Conversation is assigned to Argo' using errcode='42501'; end if;
 if p_queue is not null and not exists(select 1 from public.crm_vital_queues q
   where q.organization_id=p_org and q.queue_code=p_queue)
 then raise exception 'Unknown conversation queue' using errcode='42501'; end if;
 select queue_code into v_override from public.crm_vital_queue_assignments a
  where a.organization_id=p_org and a.connection_id=p_conn and a.contact_wa_id=p_phone;
 v_has_override:=found;
 if v_has_override and v_override is distinct from p_queue
 then raise exception 'Conversation queue changed' using errcode='42501'; end if;
 select lease_id into v_lease from public.crm_vital_reply_locks l
  where l.organization_id=p_org and l.connection_id=p_conn and l.contact_wa_id=p_phone
   and l.expires_at>now() for update;
 if v_lease is not null then raise exception 'Reply already in progress' using errcode='55P03'; end if;
 v_lease:=gen_random_uuid();
 insert into public.crm_vital_reply_locks(organization_id,connection_id,contact_wa_id,lease_id,locked_by,expires_at)
 values(p_org,p_conn,p_phone,v_lease,p_actor,now()+interval '45 seconds')
 on conflict(organization_id,connection_id,contact_wa_id) do update set
   lease_id=excluded.lease_id,locked_by=excluded.locked_by,expires_at=excluded.expires_at;
 return v_lease;
end;
$$;
revoke all on function public.crm_vital_claim_reply_atomic(uuid,uuid,uuid,text,text,uuid)
 from public,anon,authenticated;
grant execute on function public.crm_vital_claim_reply_atomic(uuid,uuid,uuid,text,text,uuid)
 to service_role;

create or replace function public.crm_vital_release_reply_atomic(
 p_org uuid,p_conn uuid,p_phone text,p_actor uuid,p_lease uuid
)
returns boolean language plpgsql security invoker set search_path=public as $$
declare v_deleted integer;
begin
 delete from public.crm_vital_reply_locks where organization_id=p_org and connection_id=p_conn
  and contact_wa_id=p_phone and locked_by=p_actor and lease_id=p_lease;
 get diagnostics v_deleted=row_count;
 return v_deleted=1;
end;
$$;
revoke all on function public.crm_vital_release_reply_atomic(uuid,uuid,text,uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.crm_vital_release_reply_atomic(uuid,uuid,text,uuid,uuid)
 to service_role;

create or replace function public.crm_vital_mia_claim_request_atomic(
 p_org uuid,p_user uuid,p_limit integer default 20
)
returns boolean language plpgsql security invoker set search_path=public as $$
declare v_role text;v_count integer;
begin
 if p_limit<1 or p_limit>30 then raise exception 'Invalid rate limit' using errcode='22023'; end if;
 if not exists(select 1 from public.crm_organizations o where o.id=p_org
   and o.workspace_code='vital-decor') then raise exception 'Invalid workspace' using errcode='42501'; end if;
 select role into v_role from public.crm_organization_members m where m.organization_id=p_org
   and m.user_id=p_user and m.status='active';
 if v_role is null or v_role not in ('owner','agent','supervisor')
 then raise exception 'Member is not authorized' using errcode='42501'; end if;
 if v_role='owner' and not exists(select 1 from public.crm_organizations o
   where o.id=p_org and o.owner_user_id=p_user)
 then raise exception 'Invalid owner' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtext(p_org::text),hashtext(p_user::text));
 delete from public.crm_vital_mia_request_log where organization_id=p_org and user_id=p_user
   and created_at<now()-interval '2 days';
 select count(*) into v_count from public.crm_vital_mia_request_log where organization_id=p_org
   and user_id=p_user and created_at>=now()-interval '1 hour';
 if v_count>=p_limit then return false; end if;
 insert into public.crm_vital_mia_request_log(organization_id,user_id) values(p_org,p_user);
 return true;
end;
$$;
revoke all on function public.crm_vital_mia_claim_request_atomic(uuid,uuid,integer)
 from public,anon,authenticated;
grant execute on function public.crm_vital_mia_claim_request_atomic(uuid,uuid,integer)
 to service_role;

create or replace function public.crm_vital_mia_save_exchange_atomic(
 p_org uuid,p_thread uuid,p_user uuid,p_user_content text,p_assistant_content text,p_title text
)
returns boolean language plpgsql security invoker set search_path=public as $$
declare v_role text;
begin
 if char_length(p_user_content) not between 1 and 1400
   or char_length(p_assistant_content) not between 1 and 8000
 then raise exception 'Invalid message size' using errcode='22023'; end if;
 select role into v_role from public.crm_organization_members m where m.organization_id=p_org
  and m.user_id=p_user and m.status='active';
 if v_role is null or v_role not in ('owner','agent','supervisor')
 then raise exception 'Member is not authorized' using errcode='42501'; end if;
 if v_role='owner' and not exists(select 1 from public.crm_organizations o
   where o.id=p_org and o.owner_user_id=p_user)
 then raise exception 'Invalid owner' using errcode='42501'; end if;
 if not exists(select 1 from public.crm_vital_mia_threads t where t.id=p_thread
   and t.organization_id=p_org and t.user_id=p_user)
 then raise exception 'Thread not found' using errcode='42501'; end if;
 -- Serialize writes to the same private thread and give every message a stable
 -- identity-based position. created_at alone ties inside one PostgreSQL statement.
 perform pg_advisory_xact_lock(hashtext(p_org::text||':'||p_user::text),hashtext(p_thread::text));
 insert into public.crm_vital_mia_messages(thread_id,organization_id,user_id,role,content)
 values(p_thread,p_org,p_user,'user',p_user_content),(p_thread,p_org,p_user,'assistant',p_assistant_content);
 update public.crm_vital_mia_threads set title=case when title='Nova conversa'
   then left(coalesce(nullif(p_title,''),'Nova conversa'),100) else title end,updated_at=now()
  where id=p_thread and organization_id=p_org and user_id=p_user;
 return true;
end;
$$;
revoke all on function public.crm_vital_mia_save_exchange_atomic(uuid,uuid,uuid,text,text,text)
 from public,anon,authenticated;
grant execute on function public.crm_vital_mia_save_exchange_atomic(uuid,uuid,uuid,text,text,text)
 to service_role;


-- Keep pending invitation drafts separate from members who are already active.
alter table public.crm_vital_invite_drafts
  add column if not exists activated_at timestamptz;

-- Only service_role may convert an existing, owner-reviewed invitation draft
-- into a real membership. This does NOT send email or generate a password.
-- The API separately calls Supabase Auth Admin and controls the release flag.
create or replace function public.crm_vital_activate_draft_member_atomic(
  p_org uuid,p_user uuid,p_email text
)
returns boolean language plpgsql security invoker set search_path=public,auth as $$
declare v_draft public.crm_vital_invite_drafts%rowtype;
 v_auth_email text;v_existing_role text;v_queue_count integer;
begin
 if p_user is null or lower(coalesce(p_email,''))<>p_email
 then raise exception 'Invalid invitation account' using errcode='22023'; end if;
 if not exists(select 1 from public.crm_organizations o
   where o.id=p_org and o.workspace_code='vital-decor')
 then raise exception 'Unknown Vital organization' using errcode='42501'; end if;
 select * into v_draft from public.crm_vital_invite_drafts d
 where d.organization_id=p_org and d.email=p_email and d.status='draft' for update;
 if not found then raise exception 'Invitation draft not found' using errcode='42501'; end if;
 if v_draft.activated_at is not null then return false; end if;
 select lower(u.email) into v_auth_email from auth.users u where u.id=p_user;
 if v_auth_email is distinct from p_email
 then raise exception 'Auth email does not match invitation' using errcode='42501'; end if;
 select m.role into v_existing_role from public.crm_organization_members m
 where m.organization_id=p_org and m.user_id=p_user for update;
 if v_existing_role='owner'
 then raise exception 'Owner cannot be reassigned via an invitation' using errcode='42501'; end if;
 select count(*) into v_queue_count from public.crm_vital_invite_draft_queues q
 where q.organization_id=p_org and q.email=p_email;
 if v_queue_count=0 then raise exception 'Invite must grant a sector' using errcode='22023'; end if;
 insert into public.crm_organization_members(
   organization_id,user_id,display_name,role,status,can_transfer
 ) values(
   p_org,p_user,v_draft.display_name,v_draft.requested_role,'active',
   v_draft.requested_role='agent' and coalesce(v_draft.can_transfer,false)
 )
 on conflict(organization_id,user_id) do update set
  display_name=excluded.display_name,role=excluded.role,status='active',
  can_transfer=excluded.can_transfer,updated_at=now();
 delete from public.crm_vital_member_queues
 where organization_id=p_org and user_id=p_user;
 insert into public.crm_vital_member_queues(organization_id,user_id,queue_code)
 select q.organization_id,p_user,q.queue_code
 from public.crm_vital_invite_draft_queues q
 where q.organization_id=p_org and q.email=p_email;
 update public.crm_vital_invite_drafts set activated_at=now(),updated_at=now()
 where organization_id=p_org and email=p_email;
 return true;
end;
$$;
revoke all on function public.crm_vital_activate_draft_member_atomic(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.crm_vital_activate_draft_member_atomic(uuid,uuid,text)
  to service_role;
