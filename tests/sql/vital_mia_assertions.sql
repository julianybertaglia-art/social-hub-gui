-- Assertions on a disposable PostgreSQL database (no real customers, keys, users or tokens).
do $$
declare vital uuid; unrelated uuid; n integer;
begin
 select id into vital from public.crm_organizations where workspace_code='vital-decor';
 select id into unrelated from public.crm_organizations where workspace_code='unrelated-workspace';
 if vital is null or unrelated is null or vital=unrelated then raise exception 'CI organizations were not created'; end if;
 select count(*) into n from public.crm_vital_queues where organization_id=vital;
 if n<>9 then raise exception 'Expected nine Vital queues, found %',n; end if;
 if not exists(select 1 from public.crm_organization_members
       where organization_id=vital and user_id='00000000-0000-4000-8000-000000000003'
         and can_transfer=false) then raise exception 'Vital supervisor transfer remains enabled'; end if;
 if not exists(select 1 from public.crm_organization_members
       where organization_id=unrelated and user_id='00000000-0000-4000-8000-000000000004'
         and can_transfer=true) then raise exception 'Unrelated supervisor was incorrectly modified'; end if;
 if not exists(select 1 from public.crm_vital_invite_drafts
       where organization_id=unrelated and can_transfer=true) then
   raise exception 'Unrelated organization invite was modified';
 end if;
 if exists(select 1 from public.crm_vital_invite_drafts
       where organization_id=vital and can_transfer=true) then
   raise exception 'Vital supervisor invite still transfers';
 end if;
end $$;

do $$
declare rel text;
begin
 foreach rel in array array[
  'crm_vital_mia_threads','crm_vital_mia_messages',
  'crm_vital_mia_request_log','crm_vital_conversation_notes','crm_vital_reply_locks'
 ] loop
  if to_regclass('public.'||rel) is null then raise exception 'Missing table %',rel; end if;
  if not (select c.relrowsecurity from pg_class c where c.oid=to_regclass('public.'||rel)) then
    raise exception 'RLS disabled on %',rel;
  end if;
  if has_table_privilege('anon','public.'||rel,'SELECT')
      or has_table_privilege('authenticated','public.'||rel,'SELECT')
      or has_table_privilege('authenticated','public.'||rel,'INSERT') then
    raise exception 'Direct client role privileges on %',rel;
  end if;
  if not has_table_privilege('service_role','public.'||rel,'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'Service role lacks permissions on %',rel;
  end if;
 end loop;
 if has_function_privilege('authenticated','public.crm_vital_mia_claim_request_atomic(uuid,uuid,integer)','EXECUTE')
    or has_function_privilege('anon','public.crm_vital_mia_claim_request_atomic(uuid,uuid,integer)','EXECUTE')
    or not has_function_privilege('service_role','public.crm_vital_mia_claim_request_atomic(uuid,uuid,integer)','EXECUTE') then
   raise exception 'MIA RPC was granted to a wrong database role';
 end if;
 if has_function_privilege('authenticated','public.crm_vital_claim_reply_atomic(uuid,uuid,uuid,text,text,uuid)','EXECUTE')
    or not has_function_privilege('service_role','public.crm_vital_claim_reply_atomic(uuid,uuid,uuid,text,text,uuid)','EXECUTE') then
   raise exception 'WhatsApp reply lease RPC has wrong role privileges';
 end if;
end $$;

-- Authenticated owner must not see unrelated organization's sectors.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $$
declare n integer;
begin
 select count(*) into n from public.crm_organization_sectors;
 if n<>6 then raise exception 'Tenant leak: Vital owner sees % sectors (expected 6)',n; end if;
 select count(*) into n from public.crm_organization_member_sectors;
 if n<>0 then raise exception 'Unexpected member sectors: %',n; end if;
end $$;
reset role;
reset request.jwt.claim.sub;

-- The private service routes must be able to use the RPCs, but users may not.
set role service_role;
do $$
declare vital uuid; conn uuid; owner uuid:='00000000-0000-4000-8000-000000000001';
        supervisor uuid:='00000000-0000-4000-8000-000000000003';
        thread uuid; lease uuid; rejected boolean;
begin
 select id into vital from public.crm_organizations where workspace_code='vital-decor';
 select id into conn from public.workspace_meta_connections
   where owner_user_id=owner and platform='whatsapp' and workspace_id='vital-decor';
 if not public.crm_vital_mia_claim_request_atomic(vital,owner,2) then raise exception 'First MIA quota claim failed'; end if;
 if not public.crm_vital_mia_claim_request_atomic(vital,owner,2) then raise exception 'Second MIA quota claim failed'; end if;
 if public.crm_vital_mia_claim_request_atomic(vital,owner,2) then raise exception 'MIA quota was bypassed'; end if;
 insert into public.crm_vital_mia_threads(organization_id,user_id,title)
   values(vital,owner,'Teste sem dados reais') returning id into thread;
 if not public.crm_vital_mia_save_exchange_atomic(vital,thread,owner,'Oi','Olá','Teste') then
   raise exception 'MIA history save failed'; end if;
 if (select count(*) from public.crm_vital_mia_messages where thread_id=thread)<>2 then
   raise exception 'Expected exactly one user message and one assistant message';
 end if;
 rejected:=false;
 begin
   perform public.crm_vital_mia_save_exchange_atomic(vital,thread,supervisor,'intrusão','não','Teste');
 exception when sqlstate '42501' then rejected:=true;
 end;
 if not rejected then raise exception 'Cross-user chat history was writable'; end if;

 lease:=public.crm_vital_claim_reply_atomic(vital,conn,owner,'5511998765432','pos_shopee',owner);
 if lease is null then raise exception 'Reply lease not issued'; end if;
 rejected:=false;
 begin
   perform public.crm_vital_claim_reply_atomic(vital,conn,owner,'5511998765432','pos_shopee',owner);
 exception when sqlstate '55P03' then rejected:=true;
 end;
 if not rejected then raise exception 'Concurrent reply lease was incorrectly issued'; end if;
 if not public.crm_vital_release_reply_atomic(vital,conn,'5511998765432',owner,lease) then
   raise exception 'Reply lease was not released'; end if;
 if public.crm_vital_transfer_atomic(vital,conn,owner,'5511998765432','pos_shopee',null,null,owner)<>'pos_shopee'
 then raise exception 'Owner transfer failed'; end if;
 if public.crm_vital_set_status_atomic(vital,conn,owner,'5511998765432','pos_shopee','resolved',owner,null)<>'resolved'
 then raise exception 'Status resolution failed'; end if;
 if not exists(select 1 from public.crm_vital_transfer_audit where organization_id=vital and contact_wa_id='5511998765432')
 or not exists(select 1 from public.crm_vital_status_audit where organization_id=vital and contact_wa_id='5511998765432')
 then raise exception 'CRM action audit records were not created'; end if;
end $$;
reset role;
