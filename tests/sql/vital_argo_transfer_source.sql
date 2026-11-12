-- Candidate RPC for isolated validation. Do not enable the bridge until every
-- assignment writer and both reply paths share the same concurrency contract.
create or replace function public.crm_vital_transfer_argo_atomic(
 p_org uuid,p_conn uuid,p_owner uuid,p_phone text,p_to_queue text,
 p_expected_from text,p_expected_override_at timestamptz,p_actor uuid,
 p_assignee text,p_expected_bridge_updated_at timestamptz,
 p_expected_bridge_assignee text,p_expected_bridge_status text,p_expected_bridge_sector text,
 p_expected_flow_selection text,p_expected_flow_last_interaction_at timestamptz
)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare
 v_role text; v_can_transfer boolean; v_target_sector text; v_expected_assignee text;
 v_override public.crm_vital_queue_assignments%rowtype; v_has_override boolean;
 v_bridge public.vital_whatsapp_assignments%rowtype; v_has_bridge boolean;
 v_flow_selection text; v_flow_time timestamptz; v_selection text; v_source text;
 v_now timestamptz;
begin
 if p_phone is null or p_phone !~ '^[0-9]{8,15}$' then
   raise exception 'Invalid contact' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtext(p_org::text||':'||p_conn::text),hashtext(p_phone));
 v_now:=clock_timestamp();
 perform 1 from public.crm_organizations o
  where o.id=p_org and o.owner_user_id=p_owner and o.workspace_code='vital-decor' for share;
 if not found then raise exception 'Invalid organization' using errcode='42501'; end if;
 perform 1 from public.workspace_meta_connections c
  where c.id=p_conn and c.owner_user_id=p_owner and c.workspace_id='vital-decor'
    and c.platform='whatsapp' and c.state='connected' for share;
 if not found then raise exception 'Invalid connection' using errcode='42501'; end if;
 select m.role,m.can_transfer into v_role,v_can_transfer
  from public.crm_organization_members m where m.organization_id=p_org
    and m.user_id=p_actor and m.status='active' for share;
 if v_role is null or (v_role='owner' and p_actor<>p_owner)
    or (v_role<>'owner' and (v_role<>'agent' or not coalesce(v_can_transfer,false)))
 then raise exception 'Member cannot transfer' using errcode='42501'; end if;
 if exists(select 1 from public.crm_vital_reply_locks l where l.organization_id=p_org
   and l.connection_id=p_conn and l.contact_wa_id=p_phone and l.expires_at>v_now)
 then raise exception 'Reply is in progress' using errcode='55P03'; end if;
 if not exists(select 1 from public.workspace_meta_messages m where m.owner_user_id=p_owner
   and m.connection_id=p_conn and m.contact_wa_id=p_phone)
 then raise exception 'Conversation not found' using errcode='22023'; end if;

 select q.parent_sector into v_target_sector from public.crm_vital_queues q
  where q.organization_id=p_org and q.queue_code=p_to_queue for share;
 if v_target_sector is null or v_target_sector is distinct from (case p_to_queue
   when 'varejo_nv' then 'comercial_vital' when 'pos_nv' then 'pos_venda'
   when 'pos_shopee' then 'pos_venda' when 'pos_tiktok' then 'pos_venda'
   when 'pos_ml' then 'pos_venda' when 'pos_amazon' then 'pos_venda'
   when 'afiliados' then 'afiliados' when 'atacado' then 'atacado'
   when 'vtx' then 'vtx' when 'bluetti' then 'bluetti' else null end)
 then raise exception 'Invalid destination queue' using errcode='22023'; end if;
 v_expected_assignee:=case when p_to_queue in ('pos_shopee','pos_tiktok','pos_ml','pos_amazon')
   then 'andrey' else 'tide' end;
 if p_assignee is distinct from v_expected_assignee then
   raise exception 'Destination and assignee disagree' using errcode='22023';
 end if;
 if v_expected_assignee='andrey' then
   perform 1 from public.vital_whatsapp_argo_keys k
    where k.connection_id=p_conn and k.owner_user_id=p_owner and k.agent='andrey'
      and k.revoked_at is null and k.expires_at>v_now order by k.expires_at desc limit 1 for share;
   if not found then raise exception 'Andrey bridge key unavailable' using errcode='55000'; end if;
 end if;

 select * into v_override from public.crm_vital_queue_assignments a
  where a.organization_id=p_org and a.connection_id=p_conn and a.contact_wa_id=p_phone for update;
 v_has_override:=found;
 if v_has_override and (v_override.owner_user_id<>p_owner
    or v_override.updated_at is distinct from p_expected_override_at)
 then raise exception 'Queue assignment changed' using errcode='40001'; end if;
 if not v_has_override and p_expected_override_at is not null
 then raise exception 'Queue assignment changed' using errcode='40001'; end if;
 select * into v_bridge from public.vital_whatsapp_assignments a
  where a.connection_id=p_conn and a.contact_wa_id=p_phone for update;
 v_has_bridge:=found;
 if v_has_bridge and (v_bridge.owner_user_id<>p_owner
   or v_bridge.updated_at is distinct from p_expected_bridge_updated_at
   or v_bridge.assigned_to is distinct from p_expected_bridge_assignee
   or v_bridge.status is distinct from p_expected_bridge_status
   or v_bridge.sector is distinct from p_expected_bridge_sector)
 then raise exception 'Bridge assignment changed' using errcode='40001'; end if;
 if not v_has_bridge and (p_expected_bridge_updated_at is not null
   or p_expected_bridge_assignee is not null or p_expected_bridge_status is not null
   or p_expected_bridge_sector is not null)
 then raise exception 'Bridge assignment changed' using errcode='40001'; end if;
 select f.selection,f.last_interaction_at into v_flow_selection,v_flow_time
  from public.vital_whatsapp_flow_sessions f where f.owner_user_id=p_owner
   and f.connection_id=p_conn and f.contact_wa_id=p_phone for update;
 if v_flow_selection is distinct from p_expected_flow_selection
   or v_flow_time is distinct from p_expected_flow_last_interaction_at
 then raise exception 'Vivi selection changed' using errcode='40001'; end if;

 v_selection:=regexp_replace(translate(replace(replace(lower(trim(coalesce(v_flow_selection,''))),
   '—','-'),'–','-'),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'),'[[:space:]]+',' ','g');
 v_source:=case
   when v_has_override then v_override.queue_code
   when v_selection='produtos vital decor' then 'varejo_nv'
   when v_selection='revenda' then 'atacado'
   when v_selection in ('pos-venda · mercado livre','pos-venda - mercado livre') then 'pos_ml'
   when v_selection in ('pos-venda · shopee','pos-venda - shopee') then 'pos_shopee'
   when v_selection in ('pos-venda · tiktok shop','pos-venda - tiktok shop') then 'pos_tiktok'
   when v_selection in ('pos-venda · amazon','pos-venda - amazon') then 'pos_amazon'
   when v_selection in ('pos-venda · nuvemshop','pos-venda - nuvemshop',
     'pos-venda · site vital decor','pos-venda - site vital decor') then 'pos_nv'
   when v_selection in ('afiliados tiktok','afiliados tiktok shop') then 'afiliados'
   when v_selection='vtx fitness' then 'vtx'
   when v_selection='bluetti' then 'bluetti'
   else case v_bridge.sector when 'atacado' then 'atacado' when 'bluetti' then 'bluetti'
     when 'vtx' then 'vtx' when 'afiliados' then 'afiliados'
     when 'comercial_vital' then 'varejo_nv' else null end
 end;
 if v_source is distinct from p_expected_from
 then raise exception 'Source queue changed' using errcode='40001'; end if;
 if v_role<>'owner' and (v_source is null or not exists(
   select 1 from public.crm_vital_member_queues g where g.organization_id=p_org
    and g.user_id=p_actor and g.queue_code=v_source))
 then raise exception 'Source queue outside access' using errcode='42501'; end if;

 insert into public.crm_vital_queue_assignments(organization_id,connection_id,owner_user_id,
   contact_wa_id,queue_code,source,changed_by,updated_at)
 values(p_org,p_conn,p_owner,p_phone,p_to_queue,'manual',p_actor,v_now)
 on conflict(organization_id,connection_id,contact_wa_id) do update set
  queue_code=excluded.queue_code,source='manual',changed_by=excluded.changed_by,updated_at=excluded.updated_at;
 insert into public.vital_whatsapp_assignments(connection_id,owner_user_id,contact_wa_id,
   sector,assigned_to,status,assigned_at,updated_at)
 values(p_conn,p_owner,p_phone,v_target_sector,v_expected_assignee,'open',v_now,v_now)
 on conflict(connection_id,contact_wa_id) do update set
  sector=excluded.sector,assigned_to=excluded.assigned_to,status='open',
  assigned_at=excluded.assigned_at,updated_at=excluded.updated_at;
 insert into public.crm_vital_transfer_audit(organization_id,connection_id,contact_wa_id,
   from_queue,to_queue,changed_by) values(p_org,p_conn,p_phone,v_source,p_to_queue,p_actor);
 return jsonb_build_object('to_queue',p_to_queue,'assigned_to',v_expected_assignee,'audit_recorded',true);
end;
$$;
revoke all on function public.crm_vital_transfer_argo_atomic(
 uuid,uuid,uuid,text,text,text,timestamptz,uuid,text,timestamptz,text,text,text,text,timestamptz)
 from public,anon,authenticated;
grant execute on function public.crm_vital_transfer_argo_atomic(
 uuid,uuid,uuid,text,text,text,timestamptz,uuid,text,timestamptz,text,text,text,text,timestamptz)
 to service_role;
