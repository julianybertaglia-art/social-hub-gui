-- Test-only PostgreSQL bootstrap. No production data or tokens.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
grant usage on schema auth to authenticated,service_role;
create table auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable
as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant execute on function auth.uid() to authenticated,service_role;
create table public.content_items(user_id uuid not null references auth.users(id),title text not null);
insert into auth.users(id) values
('00000000-0000-4000-8000-000000000001'),
('00000000-0000-4000-8000-000000000002'),
('00000000-0000-4000-8000-000000000003'),
('00000000-0000-4000-8000-000000000004'),
('00000000-0000-4000-8000-000000000005');
