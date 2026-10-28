
-- TidePlace · Vital Decor CRM team permissions foundation (2026-10-28)
-- This adds metadata only. It does NOT grant employees access to
-- existing WhatsApp, Meta, Instagram or Argo records.
create table if not exists public.crm_organizations (
  id uuid primary key default gen_random_uuid(),
  workspace_code text not null check (workspace_code ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  display_name text not null check (char_length(display_name) between 2 and 120),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (owner_user_id, workspace_code)
);
create table if not exists public.crm_organization_members (
  organization_id uuid not null references public.crm_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','supervisor','agent','installer')),
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id,user_id)
);
create table if not exists public.crm_organization_sectors (
  organization_id uuid not null references public.crm_organizations(id) on delete cascade,
  sector_code text not null check (sector_code ~ '^[a-z][a-z0-9_]{1,59}$'),
  display_name text not null check (char_length(display_name) between 2 and 120),
  created_at timestamptz not null default now(),
  primary key (organization_id,sector_code)
);
create table if not exists public.crm_organization_member_sectors (
  organization_id uuid not null,
  user_id uuid not null,
  sector_code text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id,user_id,sector_code),
  foreign key (organization_id,user_id)
    references public.crm_organization_members(organization_id,user_id) on delete cascade,
  foreign key (organization_id,sector_code)
    references public.crm_organization_sectors(organization_id,sector_code) on delete cascade
);
create index if not exists crm_org_members_by_user on public.crm_organization_members(user_id,organization_id,status);
create index if not exists crm_org_member_sectors_by_sector on public.crm_organization_member_sectors(organization_id,sector_code,user_id);

-- Deny writes via browser roles. Future invitation and team-management
-- operations must be implemented by explicitly authorized server routes.
alter table public.crm_organizations enable row level security;
alter table public.crm_organization_members enable row level security;
alter table public.crm_organization_sectors enable row level security;
alter table public.crm_organization_member_sectors enable row level security;
revoke all on public.crm_organizations from anon, authenticated;
revoke all on public.crm_organization_members from anon, authenticated;
revoke all on public.crm_organization_sectors from anon, authenticated;
revoke all on public.crm_organization_member_sectors from anon, authenticated;
grant select on public.crm_organizations to authenticated;
grant select on public.crm_organization_members to authenticated;
grant select on public.crm_organization_sectors to authenticated;
grant select on public.crm_organization_member_sectors to authenticated;

-- Policies avoid trusting user_metadata and do not recurse across
-- workspace/member tables.
create policy crm_org_members_self_read on public.crm_organization_members
  for select to authenticated using (user_id = (select auth.uid()));
create policy crm_orgs_member_read on public.crm_organizations
  for select to authenticated using (
    owner_user_id = (select auth.uid()) or exists (
      select 1 from public.crm_organization_members m
      where m.organization_id = id
        and m.user_id = (select auth.uid()) and m.status='active'
    )
  );
create policy crm_org_sectors_member_read on public.crm_organization_sectors
  for select to authenticated using (exists (
    select 1 from public.crm_organization_members m
    where m.organization_id = organization_id
      and m.user_id = (select auth.uid()) and m.status='active'
  ));
create policy crm_org_member_sectors_self_read on public.crm_organization_member_sectors
  for select to authenticated using (
    user_id = (select auth.uid()) and exists (
      select 1 from public.crm_organization_members m
      where m.organization_id = organization_id
        and m.user_id = (select auth.uid()) and m.status='active'
    )
  );

-- Seed only the Vital account whose WhatsApp owner already has the
-- existing administrative TidePlace state. Never infer owners by email.
insert into public.crm_organizations(workspace_code,display_name,owner_user_id)
select distinct 'vital-decor','Vital Decor', c.owner_user_id
from public.workspace_meta_connections c
where c.workspace_id='vital-decor' and c.platform='whatsapp'
 and exists (
   select 1 from public.content_items s
   where s.user_id=c.owner_user_id and s.title='__SOCIAL_HUB_STATE__'
 )
on conflict (owner_user_id,workspace_code) do nothing;

insert into public.crm_organization_members(organization_id,user_id,role,status)
select id,owner_user_id,'owner','active'
from public.crm_organizations where workspace_code='vital-decor'
on conflict (organization_id,user_id) do nothing;

insert into public.crm_organization_sectors(organization_id,sector_code,display_name)
select o.id,sector.sector_code,sector.display_name
from public.crm_organizations o
cross join (values
  ('comercial_vital','Comercial Vital'),
  ('atacado','Atacado / revendedores'),
  ('pos_venda','Pós-venda e pedidos'),
  ('vtx','VTX Fitness'),
  ('bluetti','Bluetti'),
  ('afiliados','Afiliados TikTok')
) as sector(sector_code,display_name)
where o.workspace_code='vital-decor'
on conflict (organization_id,sector_code) do nothing;
