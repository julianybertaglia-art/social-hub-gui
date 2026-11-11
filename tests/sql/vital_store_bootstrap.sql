-- Disposable CI database only, no production credentials or customer data.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create table public.crm_organizations(id uuid primary key);
insert into public.crm_organizations(id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');
grant usage on schema public to anon,authenticated,service_role;
