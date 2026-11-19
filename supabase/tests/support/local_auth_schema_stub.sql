-- A minimal stand-in for Supabase's `auth` schema, for DISPOSABLE LOCAL
-- test databases only (plain PostgreSQL has no `auth` schema, and the Day 21
-- migration references auth.users and auth.uid()).
--
-- It provides exactly what the migrations and tests use:
--   auth.users (id, email)  - the table staff_members references
--   auth.uid(), auth.role(), auth.jwt() - read the JWT claims PostgREST
--   puts in request.jwt.claims, the same way Supabase's functions do.
--
-- NEVER apply this to a Supabase project: Supabase manages the real auth
-- schema. The guard below refuses to run when an `auth` schema exists.
--
--   psql -v ON_ERROR_STOP=1 -d <local-db> -f supabase/tests/support/local_auth_schema_stub.sql
--
-- Apply it before the migrations.

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'auth') then
    raise exception 'refusing to create the local auth stub: an auth schema already exists (is this a real Supabase database?)';
  end if;
end
$$;

create schema auth;

create table auth.users (
  id uuid primary key,
  email text unique
);

create function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;

create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

create function auth.role() returns text
language sql stable
as $$
  select auth.jwt() ->> 'role';
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.jwt(), auth.uid(), auth.role() to anon, authenticated, service_role;
