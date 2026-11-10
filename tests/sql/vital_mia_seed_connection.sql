-- Seed the same shape of owner/connection metadata used by the legacy CRM seed.
-- Values are fictitious and exist only inside the CI PostgreSQL service.
insert into public.workspace_meta_connections (
  owner_user_id, workspace_id, platform, external_account_id, access_token,
  page_id, waba_id, display_name, state
) values (
 '00000000-0000-4000-8000-000000000001','vital-decor','whatsapp',
 '5511999990001','ci-no-real-token','ci-page','ci-waba','Vital CI','connected'
);
insert into public.content_items(user_id,title)
values('00000000-0000-4000-8000-000000000001','__SOCIAL_HUB_STATE__');
