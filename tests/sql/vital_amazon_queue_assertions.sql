-- Run after applying the candidate migration twice in disposable PostgreSQL.
do $$
declare vital uuid; n integer;
begin
 select id into vital from public.crm_organizations
  where owner_user_id='00000000-0000-4000-8000-000000000001' and workspace_code='vital-decor';
 if vital is null then raise exception 'Vital CI organization missing'; end if;
 select count(*) into n from public.crm_vital_queues where organization_id=vital;
 if n<>10 then raise exception 'Expected ten Vital queues, found %',n; end if;
 if not exists(select 1 from public.crm_vital_queues where organization_id=vital
   and queue_code='pos_amazon' and parent_sector='pos_venda'
   and display_name='Pós-venda Amazon' and sort_order=10)
 then raise exception 'Amazon queue is missing or has wrong metadata'; end if;
 if exists(select 1 from public.crm_vital_queues where queue_code='pos_amazon' and organization_id<>vital)
 then raise exception 'Amazon queue crossed the intended tenant scope'; end if;
 if exists(select 1 from public.crm_vital_member_queues where queue_code='pos_amazon')
 then raise exception 'Amazon queue unexpectedly granted staff access'; end if;
end $$;
