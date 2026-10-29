-- Atomic queue change + audit. Executable only by the server's service role.
-- Independently checks that the actor retains permissions at commit time.
create or replace function public.crm_vital_transfer_atomic(
 p_org uuid, p_conn uuid, p_owner uuid, p_phone text,
 p_to_queue text, p_expected_from text,
 p_expected_override_at timestamptz, p_actor uuid
)
returns text
language plpgsql
security invoker
set search_path=public
as $$
declare
 v_role text;
 v_existing public.crm_vital_queue_assignments%rowtype;
 v_found boolean := false;
begin
 if p_phone !~ '^[0-9]{8,15}$' then
   raise exception 'Invalid contact' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtext(p_org::text||':'||p_conn::text), hashtext(p_phone));
 if not exists(select 1 from public.crm_organizations o
     where o.id=p_org and o.owner_user_id=p_owner and o.workspace_code='vital-decor')
   or not exists(select 1 from public.workspace_meta_connections c
     where c.id=p_conn and c.owner_user_id=p_owner
       and c.workspace_id='vital-decor' and c.platform='whatsapp' and c.state='connected')
 then raise exception 'Invalid workspace or WhatsApp connection' using errcode='42501';
 end if;
 select m.role into v_role from public.crm_organization_members m
   where m.organization_id=p_org and m.user_id=p_actor and m.status='active';
 if v_role is null or v_role not in ('owner','supervisor','agent') then
   raise exception 'Member is not authorized' using errcode='42501';
 end if;
 if v_role='owner' and p_actor<>p_owner then
   raise exception 'Owner does not match' using errcode='42501';
 end if;
 if v_role<>'owner' and (p_expected_from is null or not exists(
    select 1 from public.crm_vital_member_queues g where
     g.organization_id=p_org and g.user_id=p_actor and g.queue_code=p_expected_from))
 then raise exception 'Conversation is outside allowed queues' using errcode='42501';
 end if;
 if not exists(select 1 from public.crm_vital_queues q
   where q.organization_id=p_org and q.queue_code=p_to_queue)
 then raise exception 'Unknown destination queue' using errcode='22023';
 end if;
 select * into v_existing from public.crm_vital_queue_assignments x
  where x.organization_id=p_org and x.connection_id=p_conn and x.contact_wa_id=p_phone
  for update;
 v_found:=found;
 if v_found then
   if p_expected_override_at is distinct from v_existing.updated_at
     or p_expected_from is distinct from v_existing.queue_code
   then raise exception 'Conversation assignment changed concurrently' using errcode='40001';
   end if;
 elsif p_expected_override_at is not null then
   raise exception 'Conversation assignment changed concurrently' using errcode='40001';
 end if;
 insert into public.crm_vital_queue_assignments(
   organization_id,connection_id,owner_user_id,contact_wa_id,queue_code,
   source,changed_by,updated_at
 ) values(p_org,p_conn,p_owner,p_phone,p_to_queue,'manual',p_actor,now())
 on conflict (organization_id,connection_id,contact_wa_id)
 do update set queue_code=excluded.queue_code,
  source='manual',changed_by=excluded.changed_by,updated_at=excluded.updated_at;
 insert into public.crm_vital_transfer_audit(
   organization_id,connection_id,contact_wa_id,from_queue,to_queue,changed_by
 ) values(p_org,p_conn,p_phone,p_expected_from,p_to_queue,p_actor);
 return p_to_queue;
end;
$$;
revoke all on function public.crm_vital_transfer_atomic(
 uuid,uuid,uuid,text,text,text,timestamptz,uuid)
 from public,anon,authenticated;
grant execute on function public.crm_vital_transfer_atomic(
 uuid,uuid,uuid,text,text,text,timestamptz,uuid) to service_role;
