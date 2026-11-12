-- Disposable PostgreSQL fixtures only: no customer data, network or real keys.
insert into public.workspace_meta_messages(connection_id,owner_user_id,meta_message_id,
 contact_wa_id,direction,message_type,status,sent_at)
select id,owner_user_id,'qa-argo-'||n,'551100000000'||n,'inbound','text','received',now()
from public.workspace_meta_connections cross join generate_series(1,6) n
where workspace_id='vital-decor' and platform='whatsapp';
insert into public.vital_whatsapp_flow_sessions(connection_id,owner_user_id,contact_wa_id,
 stage,selection,human_handoff,last_interaction_at)
select id,owner_user_id,'551100000000'||n,'await_human',
 case when n in (2,6) then 'Pós-venda · Amazon' else 'Pós-venda · Shopee' end,true,'2026-01-01T00:00:00Z'
from public.workspace_meta_connections cross join generate_series(1,6) n
where workspace_id='vital-decor' and platform='whatsapp';
insert into public.vital_whatsapp_assignments(connection_id,owner_user_id,contact_wa_id,
 sector,assigned_to,status,updated_at)
select id,owner_user_id,'551100000000'||n,'pos_venda','tide','open','2026-01-01T00:00:00Z'
from public.workspace_meta_connections cross join generate_series(1,6) n
where workspace_id='vital-decor' and platform='whatsapp';

-- Force the bridge write to fail for one fixture and prove the queue write rolls back.
create function public.qa_reject_bridge_write() returns trigger language plpgsql as $$
begin
 if new.contact_wa_id='5511000000003' then raise exception 'forced fixture failure'; end if;
 return new;
end $$;
create trigger qa_reject_bridge_write before insert or update on public.vital_whatsapp_assignments
 for each row execute function public.qa_reject_bridge_write();

do $$
declare sig text:='public.crm_vital_transfer_argo_atomic(uuid,uuid,uuid,text,text,text,timestamptz,uuid,text,timestamptz,text,text,text,text,timestamptz)';
begin
 if has_function_privilege('anon',sig,'EXECUTE') or has_function_privilege('authenticated',sig,'EXECUTE')
   or not has_function_privilege('service_role',sig,'EXECUTE')
 then raise exception 'Wrong RPC execute privileges'; end if;
end $$;

set role service_role;
do $$
declare
 org uuid; other_org uuid; conn uuid; owner_id uuid:='00000000-0000-4000-8000-000000000001';
 agent_id uuid:='00000000-0000-4000-8000-000000000005';
 supervisor_id uuid:='00000000-0000-4000-8000-000000000003';
 flow_at timestamptz:='2026-01-01T00:00:00Z'; override_at timestamptz; bridge_at timestamptz;
 result jsonb; failed boolean; audits integer;
begin
 select id into org from public.crm_organizations where workspace_code='vital-decor' and owner_user_id=owner_id;
 select id into other_org from public.crm_organizations where workspace_code='unrelated-workspace';
 select id into conn from public.workspace_meta_connections where workspace_id='vital-decor' and owner_user_id=owner_id and platform='whatsapp';
 if org is null or other_org is null or conn is null then raise exception 'Fixture scope missing'; end if;

 failed:=false;
 begin
  perform public.crm_vital_transfer_argo_atomic(other_org,conn,owner_id,'5511000000001','pos_amazon',
   'pos_shopee',null,owner_id,'andrey',flow_at,'tide','open','pos_venda','Pós-venda · Shopee',flow_at);
 exception when insufficient_privilege then failed:=true; end;
 if not failed then raise exception 'Cross-tenant scope was accepted'; end if;

 failed:=false;
 begin
  perform public.crm_vital_transfer_argo_atomic(org,conn,owner_id,'5511000000001','pos_amazon',
   'pos_shopee',null,owner_id,'andrey',flow_at,'tide','open','pos_venda','Pós-venda · Shopee',flow_at);
 exception when sqlstate '55000' then failed:=true; end;
 if not failed or exists(select 1 from public.crm_vital_queue_assignments where contact_wa_id='5511000000001')
 then raise exception 'Missing key did not fail closed'; end if;

 insert into public.vital_whatsapp_argo_keys(connection_id,owner_user_id,agent,label,prefix,secret_hash,expires_at)
 values(conn,owner_id,'andrey','fixture','qa-only','fake-hash-no-secret',now()+interval '1 day');
 result:=public.crm_vital_transfer_argo_atomic(org,conn,owner_id,'5511000000001','pos_amazon',
   'pos_shopee',null,owner_id,'andrey',flow_at,'tide','open','pos_venda','Pós-venda · Shopee',flow_at);
 if result->>'to_queue'<>'pos_amazon' or result->>'assigned_to'<>'andrey'
   or result->>'audit_recorded'<>'true' then raise exception 'Bad RPC confirmation'; end if;
 if not exists(select 1 from public.crm_vital_queue_assignments where organization_id=org
   and connection_id=conn and contact_wa_id='5511000000001' and queue_code='pos_amazon' and source='manual')
   or not exists(select 1 from public.vital_whatsapp_assignments where connection_id=conn
   and contact_wa_id='5511000000001' and sector='pos_venda' and assigned_to='andrey' and status='open')
 then raise exception 'Queue and bridge were not updated together'; end if;
 select count(*) into audits from public.crm_vital_transfer_audit where organization_id=org and contact_wa_id='5511000000001';
 if audits<>1 then raise exception 'Expected one transfer audit'; end if;

 select updated_at into override_at from public.crm_vital_queue_assignments where organization_id=org and contact_wa_id='5511000000001';
 select updated_at into bridge_at from public.vital_whatsapp_assignments where connection_id=conn and contact_wa_id='5511000000001';
 failed:=false;
 begin
  perform public.crm_vital_transfer_argo_atomic(org,conn,owner_id,'5511000000001','pos_nv',
   'pos_amazon',override_at,supervisor_id,'tide',bridge_at,'andrey','open','pos_venda','Pós-venda · Shopee',flow_at);
 exception when insufficient_privilege then failed:=true; end;
 if not failed then raise exception 'Supervisor was allowed to transfer'; end if;
 failed:=false;
 begin
  perform public.crm_vital_transfer_argo_atomic(org,conn,owner_id,'5511000000001','pos_nv',
   'pos_amazon',override_at,agent_id,'tide',bridge_at,'andrey','open','pos_venda','Pós-venda · Shopee',flow_at);
 exception when insufficient_privilege then failed:=true; end;
 if not failed then raise exception 'Agent without transfer permission was allowed'; end if;
 update public.crm_organization_members set can_transfer=true
  where organization_id=org and user_id=agent_id;
 failed:=false;
 begin
  perform public.crm_vital_transfer_argo_atomic(org,conn,owner_id,'5511000000001','pos_nv',
   'pos_amazon',override_at,agent_id,'tide',bridge_at,'andrey','open','pos_venda','Pós-venda · Shopee',flow_at);
 exception when insufficient_privilege then failed:=true; end;
 if not failed then raise exception 'Agent transferred outside the granted source queue'; end if;
 failed:=false;
 begin
  perform public.crm_vital_transfer_argo_atomic(org,conn,owner_id,'5511000000001','pos_nv',
   'pos_amazon',override_at,owner_id,'tide',bridge_at-interval '1 second','andrey','open','pos_venda','Pós-venda · Shopee',flow_at);
 exception when serialization_failure then failed:=true; end;
 if not failed then raise exception 'Stale bridge state was accepted'; end if;
 failed:=false;
 begin
  perform public.crm_vital_transfer_argo_atomic(org,conn,owner_id,'5511000000001','pos_nv',
   'pos_amazon',override_at,owner_id,'tide',bridge_at,'andrey','open','pos_venda','Pós-venda · Amazon',flow_at);
 exception when serialization_failure then failed:=true; end;
 if not failed then raise exception 'Stale Vivi selection was accepted'; end if;
 failed:=false;
 begin
  perform public.crm_vital_transfer_argo_atomic(org,conn,owner_id,'5511000000001','pos_nv',
   'pos_amazon',override_at,owner_id,'andrey',bridge_at,'andrey','open','pos_venda','Pós-venda · Shopee',flow_at);
 exception when invalid_parameter_value then failed:=true; end;
 if not failed then raise exception 'Site queue was assigned to Andrey'; end if;
 select count(*) into audits from public.crm_vital_transfer_audit where organization_id=org and contact_wa_id='5511000000001';
 if audits<>1 then raise exception 'Rejected transfers changed the audit'; end if;
 insert into public.crm_vital_reply_locks(organization_id,connection_id,contact_wa_id,lease_id,locked_by,expires_at)
 values(org,conn,'5511000000001',gen_random_uuid(),owner_id,now()+interval '1 minute');
 failed:=false;
 begin
  perform public.crm_vital_transfer_argo_atomic(org,conn,owner_id,'5511000000001','pos_nv',
   'pos_amazon',override_at,owner_id,'tide',bridge_at,'andrey','open','pos_venda','Pós-venda · Shopee',flow_at);
 exception when lock_not_available then failed:=true; end;
 if not failed then raise exception 'Active Tide reply was not protected'; end if;
 delete from public.crm_vital_reply_locks where organization_id=org and contact_wa_id='5511000000001';
 result:=public.crm_vital_transfer_argo_atomic(org,conn,owner_id,'5511000000001','pos_nv',
   'pos_amazon',override_at,owner_id,'tide',bridge_at,'andrey','open','pos_venda','Pós-venda · Shopee',flow_at);
 if result->>'assigned_to'<>'tide' or not exists(select 1 from public.vital_whatsapp_assignments
   where connection_id=conn and contact_wa_id='5511000000001' and assigned_to='tide')
 then raise exception 'Site conversation was not returned to Tide'; end if;

 -- Amazon classification works without a prior manual queue override.
 result:=public.crm_vital_transfer_argo_atomic(org,conn,owner_id,'5511000000002','pos_ml',
   'pos_amazon',null,owner_id,'andrey',flow_at,'tide','open','pos_venda','Pós-venda · Amazon',flow_at);
 if result->>'to_queue'<>'pos_ml' then raise exception 'Amazon source classification failed'; end if;
 result:=public.crm_vital_transfer_argo_atomic(org,conn,owner_id,'5511000000004','pos_ml',
   'pos_shopee',null,agent_id,'andrey',flow_at,'tide','open','pos_venda','Pós-venda · Shopee',flow_at);
 if result->>'assigned_to'<>'andrey' then raise exception 'Authorized agent transfer failed'; end if;
 result:=public.crm_vital_transfer_argo_atomic(org,conn,owner_id,'5511000000006','pos_amazon',
   'pos_amazon',null,owner_id,'andrey',flow_at,'tide','open','pos_venda','Pós-venda · Amazon',flow_at);
 if result->>'assigned_to'<>'andrey' or not exists(select 1 from public.vital_whatsapp_assignments
   where connection_id=conn and contact_wa_id='5511000000006' and assigned_to='andrey')
 then raise exception 'Same-queue reconciliation failed'; end if;

 failed:=false;
 begin
  perform public.crm_vital_transfer_argo_atomic(org,conn,owner_id,'5511000000003','pos_ml',
   'pos_shopee',null,owner_id,'andrey',flow_at,'tide','open','pos_venda','Pós-venda · Shopee',flow_at);
 exception when raise_exception then
  if sqlerrm='forced fixture failure' then failed:=true; else raise; end if;
 end;
 if not failed or exists(select 1 from public.crm_vital_queue_assignments where organization_id=org and contact_wa_id='5511000000003')
   or exists(select 1 from public.crm_vital_transfer_audit where organization_id=org and contact_wa_id='5511000000003')
 then raise exception 'Failed bridge write did not roll back queue and audit'; end if;
end $$;
reset role;
