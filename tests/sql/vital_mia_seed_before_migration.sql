-- Fictitious organizations before the MIA migration, to verify tenant scoping.
alter table public.crm_organization_members add column if not exists can_transfer boolean not null default false;
alter table public.crm_vital_invite_drafts add column if not exists can_transfer boolean not null default false;

insert into public.crm_organizations(workspace_code,display_name,owner_user_id)
values('unrelated-workspace','Unrelated CI Workspace','00000000-0000-4000-8000-000000000002');

insert into public.crm_organization_members(organization_id,user_id,role,status,can_transfer)
select id,owner_user_id,'owner','active',false
from public.crm_organizations where workspace_code='unrelated-workspace';

insert into public.crm_organization_sectors(organization_id,sector_code,display_name)
select id,'not_vital','Unrelated Queue'
from public.crm_organizations where workspace_code='unrelated-workspace';

insert into public.crm_organization_members(organization_id,user_id,role,status,can_transfer)
select id,'00000000-0000-4000-8000-000000000003','supervisor','active',true
from public.crm_organizations where workspace_code='vital-decor';
insert into public.crm_organization_members(organization_id,user_id,role,status,can_transfer)
select id,'00000000-0000-4000-8000-000000000004','supervisor','active',true
from public.crm_organizations where workspace_code='unrelated-workspace';
insert into public.crm_organization_members(organization_id,user_id,role,status,can_transfer)
select id,'00000000-0000-4000-8000-000000000005','agent','active',false
from public.crm_organizations where workspace_code='vital-decor';
insert into public.crm_vital_member_queues(organization_id,user_id,queue_code)
select id,'00000000-0000-4000-8000-000000000005','pos_shopee'
from public.crm_organizations where workspace_code='vital-decor';

insert into public.crm_vital_invite_drafts(organization_id,email,display_name,requested_role,status,can_transfer)
select id,'sample-vital@example.test','Vital Example','supervisor','draft',true
from public.crm_organizations where workspace_code='vital-decor';
insert into public.crm_vital_invite_drafts(organization_id,email,display_name,requested_role,status,can_transfer)
select id,'sample-other@example.test','Other Example','supervisor','draft',true
from public.crm_organizations where workspace_code='unrelated-workspace';
