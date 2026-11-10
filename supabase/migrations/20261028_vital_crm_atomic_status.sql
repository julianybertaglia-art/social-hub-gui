-- One transaction for CRM resolution state and its audit entry.
create or replace function public.crm_vital_set_status_atomic(
 p_org uuid,p_conn uuid,p_owner uuid,p_phone text,
 p_source_queue text,p_new_status text,p_actor uuid,
 p_expected_updated_at timestamptz
)
returns text
language plpgsql
security invoker
set search_path=public
as $$
declare
 v_role text;
 v_state public.crm_vital_conversation_states%rowtype;
 v_found boolean:=false;
 v_prior text;
begin
 if p_phone !~ '^[0-9]{8,15}$'
   or p_new_status not in ('open','resolved') then
   raise exception 'Invalid conversation status' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtext(p_org::text||':'||p_conn::text),hashtext(p_phone));
 if not exists(select 1 from public.crm_organizations o
     where o.id=p_org and o.owner_user_id=p_owner and o.workspace_code='vital-decor')
   or not exists(select 1 from public.workspace_meta_connections c
     where c.id=p_conn and c.owner_user_id=p_owner and c.state='connected'
       and c.workspace_id='vital-decor' and c.platform='whatsapp')
 then raise exception 'Workspace not authorized' using errcode='42501'; end if;
 select role into v_role from public.crm_organization_members m
  where m.organization_id=p_org and m.user_id=p_actor and m.status='active';
 if v_role is null or v_role not in ('owner','agent') then
   raise exception 'Not authorized to change conversation status' using errcode='42501';
 end if;
 if v_role='owner' and p_actor<>p_owner then
   raise exception 'Invalid owner' using errcode='42501';
 end if;
 if not exists(select 1 from public.crm_vital_queues q
    where q.organization_id=p_org and q.queue_code=p_source_queue)
   or (v_role='agent' and not exists(
     select 1 from public.crm_vital_member_queues g
      where g.organization_id=p_org and g.user_id=p_actor and g.queue_code=p_source_queue))
 then raise exception 'Source queue outside access' using errcode='42501'; end if;
 select * into v_state from public.crm_vital_conversation_states s
  where s.organization_id=p_org and s.connection_id=p_conn and s.contact_wa_id=p_phone
  for update;
 v_found:=found;
 if v_found then
  if v_state.updated_at is distinct from p_expected_updated_at then
    raise exception 'Status changed concurrently' using errcode='40001'; end if;
  v_prior:=v_state.status;
 elsif p_expected_updated_at is not null then
  raise exception 'Status changed concurrently' using errcode='40001';
 end if;
 if v_prior is not distinct from p_new_status then return p_new_status; end if;
 insert into public.crm_vital_conversation_states
  (organization_id,connection_id,owner_user_id,contact_wa_id,status,updated_by,updated_at)
 values(p_org,p_conn,p_owner,p_phone,p_new_status,p_actor,now())
 on conflict(organization_id,connection_id,contact_wa_id)
 do update set status=excluded.status,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 insert into public.crm_vital_status_audit
  (organization_id,connection_id,contact_wa_id,old_status,new_status,updated_by)
 values(p_org,p_conn,p_phone,v_prior,p_new_status,p_actor);
 return p_new_status;
end;
$$;
revoke all on function public.crm_vital_set_status_atomic(
 uuid,uuid,uuid,text,text,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.crm_vital_set_status_atomic(
 uuid,uuid,uuid,text,text,text,uuid,timestamptz) to service_role;
