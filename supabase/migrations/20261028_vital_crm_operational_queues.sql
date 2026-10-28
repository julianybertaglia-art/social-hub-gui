-- Vital Decor operational inbox queues. Adds narrow, explicit permissions.
-- Existing Meta, Argo, WhatsApp flow and older CRM records are untouched.
create table if not exists public.crm_vital_queues (
  organization_id uuid not null references public.crm_organizations(id) on delete cascade,
  queue_code text not null check (queue_code ~ '^[a-z][a-z0-9_]{1,50}$'),
  parent_sector text not null,
  display_name text not null,
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order smallint not null,
  primary key (organization_id, queue_code),
  foreign key (organization_id, parent_sector)
    references public.crm_organization_sectors(organization_id,sector_code)
);
create table if not exists public.crm_vital_member_queues (
  organization_id uuid not null,
  user_id uuid not null,
  queue_code text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id,user_id,queue_code),
  foreign key (organization_id,user_id)
    references public.crm_organization_members(organization_id,user_id) on delete cascade,
  foreign key (organization_id,queue_code)
    references public.crm_vital_queues(organization_id,queue_code) on delete cascade
);
create index if not exists crm_vital_member_queues_user_idx
  on public.crm_vital_member_queues(user_id,organization_id);
create table if not exists public.crm_vital_queue_assignments (
  organization_id uuid not null references public.crm_organizations(id) on delete cascade,
  connection_id uuid not null references public.workspace_meta_connections(id),
  owner_user_id uuid not null references auth.users(id),
  contact_wa_id text not null check (contact_wa_id ~ '^[0-9]{8,15}$'),
  queue_code text not null,
  source text not null check(source in ('manual','automation')),
  changed_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (organization_id,connection_id,contact_wa_id),
  foreign key (organization_id,queue_code)
    references public.crm_vital_queues(organization_id,queue_code)
);
create index if not exists crm_vital_queue_assignments_queue_idx
  on public.crm_vital_queue_assignments(organization_id,queue_code,updated_at desc);
create table if not exists public.crm_vital_transfer_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crm_organizations(id),
  connection_id uuid not null references public.workspace_meta_connections(id),
  contact_wa_id text not null,
  from_queue text,
  to_queue text not null,
  changed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.crm_vital_queues enable row level security;
alter table public.crm_vital_member_queues enable row level security;
alter table public.crm_vital_queue_assignments enable row level security;
alter table public.crm_vital_transfer_audit enable row level security;
revoke all on public.crm_vital_queues,public.crm_vital_member_queues,
  public.crm_vital_queue_assignments,public.crm_vital_transfer_audit
  from anon,authenticated;
grant select on public.crm_vital_queues, public.crm_vital_member_queues,
  public.crm_vital_queue_assignments to authenticated;

-- Members may see queue definitions, but not other employees' permissions.
create policy vital_queue_catalog_read on public.crm_vital_queues for select to authenticated
 using (exists(select 1 from public.crm_organization_members m
   where m.organization_id=crm_vital_queues.organization_id and m.user_id=(select auth.uid()) and m.status='active'));
create policy vital_member_own_queues on public.crm_vital_member_queues for select to authenticated
 using (user_id=(select auth.uid()) and exists(select 1 from public.crm_organization_members m
   where m.organization_id=crm_vital_member_queues.organization_id and m.user_id=(select auth.uid()) and m.status='active'));
create policy vital_queue_assignment_read on public.crm_vital_queue_assignments for select to authenticated
 using (owner_user_id=(select auth.uid()) or exists(
   select 1 from public.crm_vital_member_queues q
   join public.crm_organization_members m
     on m.organization_id=q.organization_id and m.user_id=q.user_id
   where q.organization_id=crm_vital_queue_assignments.organization_id and q.queue_code=crm_vital_queue_assignments.queue_code
     and q.user_id=(select auth.uid()) and m.status='active'
 ));
-- transfer audit remains accessible only from the server.
insert into public.crm_vital_queues
  (organization_id,queue_code,parent_sector,display_name,color,sort_order)
select o.id,v.code,v.parent,v.label,v.color,v.position
from public.crm_organizations o
cross join (values
 ('varejo_nv','comercial_vital','Varejo Nuvemshop','#327fc2',1),
 ('pos_nv','pos_venda','Pós-venda Nuvemshop','#db843e',2),
 ('afiliados','afiliados','Afiliados TikTok Shop','#b94e82',3),
 ('pos_shopee','pos_venda','Pós-venda Shopee','#ec6c36',4),
 ('pos_tiktok','pos_venda','Pós-venda TikTok Shop','#dc526b',5),
 ('atacado','atacado','Atacado','#845bb8',6),
 ('vtx','vtx','VTX Fitness','#2b9d8d',7),
 ('bluetti','bluetti','Bluetti','#1685aa',8),
 ('pos_ml','pos_venda','Pós-venda Mercado Livre','#d4a23d',9)
) as v(code,parent,label,color,position)
where o.workspace_code='vital-decor'
on conflict (organization_id,queue_code) do nothing;
