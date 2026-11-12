-- Fictitious organizations without the Vital WhatsApp connection.
insert into public.crm_organizations(workspace_code,display_name,owner_user_id)
values ('unrelated-workspace','Other CI','00000000-0000-4000-8000-000000000002'),
       ('vital-decor','Unconnected CI','00000000-0000-4000-8000-000000000003');
insert into public.crm_organization_sectors(organization_id,sector_code,display_name)
select id,'pos_venda','Pós-venda'
from public.crm_organizations where owner_user_id in (
 '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'
);
