-- Staged SQL for the CLI-generated migration. Adds metadata, not team grants.
insert into public.crm_vital_queues
  (organization_id,queue_code,parent_sector,display_name,color,sort_order)
select o.id,'pos_amazon','pos_venda','Pós-venda Amazon','#df8f2f',10
from public.crm_organizations o
where o.workspace_code='vital-decor'
  and exists (
    select 1 from public.workspace_meta_connections c
    where c.owner_user_id=o.owner_user_id
      and c.workspace_id='vital-decor' and c.platform='whatsapp'
  )
  and exists (
    select 1 from public.crm_organization_sectors s
    where s.organization_id=o.id and s.sector_code='pos_venda'
  )
on conflict (organization_id,queue_code) do nothing;
