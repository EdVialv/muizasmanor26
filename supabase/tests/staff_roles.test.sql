-- Day 21 regression test: staff roles and Row Level Security
-- (docs/DAY21_AUTH_PERMISSIONS_NOTES.md; migration 20261119090000_staff_roles.sql).
--
-- Checks, as the database itself enforces them:
--   - anon: no access to staff_members; published objects only;
--   - a signed-in user without a staff role: no staff rows, published only,
--     even with "role": "administrator" in user_metadata / app_metadata;
--   - an editor: their own staff row only; every object status;
--   - an administrator: every staff row; every object status;
--   - nobody can insert, update or delete a role through the API roles -
--     not even an administrator - so no one can grant or escalate a role;
--   - public search and map functions still return published objects only,
--     even for staff.
--
-- Run ONLY against a disposable local database with every migration applied
-- (plus, on plain PostgreSQL, supabase/tests/support/local_auth_schema_stub.sql
-- before the migrations) - never against a shared or production project:
--
--   psql -v ON_ERROR_STOP=1 -d <local-db> -f supabase/tests/staff_roles.test.sql
--
-- Everything happens inside one transaction that is rolled back; a failed
-- assertion raises an exception.

begin;

-- Fixtures: three users with fixed, obviously fake ids; one draft, one
-- review, one published object named "Kvazistaff ...".
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'administrators@example.invalid'),
  ('00000000-0000-4000-8000-0000000000e1', 'redaktors@example.invalid'),
  ('00000000-0000-4000-8000-0000000000c1', 'lietotajs@example.invalid');

-- A trusted operator (the database owner) provisions the roles.
insert into public.staff_members (user_id, role, note) values
  ('00000000-0000-4000-8000-0000000000a1', 'administrator', 'Day 21 test'),
  ('00000000-0000-4000-8000-0000000000e1', 'editor', 'Day 21 test');

insert into heritage_objects (source_system, external_source_id, object_type, slug, name_lv, summary_lv,
                              municipality, latitude, longitude, status, source_url, last_verified_at)
values
  ('staff_test', 'st-draft', 'manor_house', 'st-draft', 'Kvazistaff melnraksts', '[Testa dati]', 'Testa novads', 57.1, 26.1, 'draft', 'https://example.invalid/st', '2026-11-01'),
  ('staff_test', 'st-review', 'manor_house', 'st-review', 'Kvazistaff pārskatīšanā', '[Testa dati]', 'Testa novads', 57.1, 26.1, 'review', 'https://example.invalid/st', '2026-11-01'),
  ('staff_test', 'st-published', 'manor_house', 'st-published', 'Kvazistaff publicēts', '[Testa dati]', 'Testa novads', 57.1, 26.1, 'published', 'https://example.invalid/st', '2026-11-01');

-- Helpers: assert that a statement fails with insufficient_privilege, and
-- become a given user (claims as PostgREST sets them from a verified JWT).
create function pg_temp.expect_denied(statement text, label text) returns void
language plpgsql as $$
begin
  begin
    execute statement;
  exception when insufficient_privilege then
    return;
  end;
  raise exception '%: expected permission denied, but the statement succeeded', label;
end;
$$;

create function pg_temp.become(claims jsonb) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', claims::text, true);
end;
$$;

grant execute on function pg_temp.expect_denied(text, text) to anon, authenticated;
grant execute on function pg_temp.become(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------
set local role anon;
select pg_temp.become('{"role": "anon"}');

select pg_temp.expect_denied('select * from public.staff_members', 'anon reads staff_members');
select pg_temp.expect_denied('select private.current_staff_role()', 'anon calls current_staff_role');
do $$
declare n int;
begin
  select count(*) into n from heritage_objects where source_system = 'staff_test';
  if n <> 1 then raise exception 'anon sees % staff_test objects (expected 1, the published one)', n; end if;
end $$;
select pg_temp.expect_denied(
  $q$insert into public.staff_members (user_id, role) values ('00000000-0000-4000-8000-0000000000c1', 'administrator')$q$,
  'anon grants a role');

reset role;

-- ---------------------------------------------------------------------------
-- signed in, no staff role - even claiming one in metadata
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.become('{"sub": "00000000-0000-4000-8000-0000000000c1", "role": "authenticated",
  "user_metadata": {"role": "administrator", "staff_role": "administrator"},
  "app_metadata": {"role": "administrator"}}');

do $$
declare n int; r public.staff_role;
begin
  select count(*) into n from public.staff_members;
  if n <> 0 then raise exception 'non-staff user sees % staff rows (expected 0)', n; end if;
  select private.current_staff_role() into r;
  if r is not null then raise exception 'non-staff user has role % (metadata must not grant one)', r; end if;
  select count(*) into n from heritage_objects where source_system = 'staff_test';
  if n <> 1 then raise exception 'non-staff user sees % staff_test objects (expected 1)', n; end if;
end $$;

select pg_temp.expect_denied(
  $q$insert into public.staff_members (user_id, role) values ('00000000-0000-4000-8000-0000000000c1', 'administrator')$q$,
  'non-staff user grants themselves a role');
select pg_temp.expect_denied(
  $q$update public.staff_members set role = 'administrator'$q$,
  'non-staff user updates staff_members');
select pg_temp.expect_denied(
  $q$update heritage_objects set status = 'published' where slug = 'st-draft'$q$,
  'non-staff user publishes an object');

reset role;

-- ---------------------------------------------------------------------------
-- editor
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.become('{"sub": "00000000-0000-4000-8000-0000000000e1", "role": "authenticated"}');

do $$
declare n int; r public.staff_role; own uuid;
begin
  select private.current_staff_role() into r;
  if r is distinct from 'editor' then raise exception 'editor has role %', r; end if;
  select count(*), min(user_id::text)::uuid into n, own from public.staff_members;
  if n <> 1 or own <> '00000000-0000-4000-8000-0000000000e1' then
    raise exception 'editor sees % staff rows (expected only their own)', n;
  end if;
  select count(*) into n from heritage_objects where source_system = 'staff_test';
  if n <> 3 then raise exception 'editor sees % staff_test objects (expected 3: draft, review, published)', n; end if;
end $$;

-- An editor cannot make themselves an administrator, add or remove anyone.
select pg_temp.expect_denied(
  $q$update public.staff_members set role = 'administrator' where user_id = '00000000-0000-4000-8000-0000000000e1'$q$,
  'editor escalates their own role');
select pg_temp.expect_denied(
  $q$insert into public.staff_members (user_id, role) values ('00000000-0000-4000-8000-0000000000c1', 'editor')$q$,
  'editor grants a role to someone else');
select pg_temp.expect_denied(
  $q$delete from public.staff_members where user_id = '00000000-0000-4000-8000-0000000000a1'$q$,
  'editor removes an administrator');
-- Day 21 adds no content writes for anyone.
select pg_temp.expect_denied(
  $q$update heritage_objects set name_lv = 'x' where slug = 'st-draft'$q$,
  'editor edits an object (Day 22)');

-- Public functions stay published-only, even for staff.
do $$
declare n int;
begin
  select count(*) into n
    from public.public_map_objects(25.0, 56.5, 27.0, 57.5, 12, search_query => 'kvazistaff');
  if n <> 1 then raise exception 'public map returns % Kvazistaff objects for an editor (expected 1)', n; end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- administrator
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.become('{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}');

do $$
declare n int; r public.staff_role;
begin
  select private.current_staff_role() into r;
  if r is distinct from 'administrator' then raise exception 'administrator has role %', r; end if;
  select count(*) into n from public.staff_members where note = 'Day 21 test';
  if n <> 2 then raise exception 'administrator sees % staff rows (expected 2)', n; end if;
  select count(*) into n from heritage_objects where source_system = 'staff_test';
  if n <> 3 then raise exception 'administrator sees % staff_test objects (expected 3)', n; end if;
end $$;

-- Roles are provisioned outside the application, even by administrators.
select pg_temp.expect_denied(
  $q$insert into public.staff_members (user_id, role) values ('00000000-0000-4000-8000-0000000000c1', 'editor')$q$,
  'administrator grants a role through the API');
select pg_temp.expect_denied(
  $q$update public.staff_members set role = 'editor' where user_id = '00000000-0000-4000-8000-0000000000e1'$q$,
  'administrator changes a role through the API');

reset role;

-- ---------------------------------------------------------------------------
-- revoking access takes effect immediately
-- ---------------------------------------------------------------------------
delete from public.staff_members where user_id = '00000000-0000-4000-8000-0000000000e1';

set local role authenticated;
select pg_temp.become('{"sub": "00000000-0000-4000-8000-0000000000e1", "role": "authenticated"}');
do $$
declare n int; r public.staff_role;
begin
  select private.current_staff_role() into r;
  if r is not null then raise exception 'revoked editor still has role %', r; end if;
  select count(*) into n from heritage_objects where source_system = 'staff_test';
  if n <> 1 then raise exception 'revoked editor sees % staff_test objects (expected 1)', n; end if;
end $$;

-- A token for a user that does not exist (or was deleted) has no role either.
select pg_temp.become('{"sub": "00000000-0000-4000-8000-00000000dead", "role": "authenticated"}');
do $$
begin
  if private.current_staff_role() is not null then raise exception 'unknown user has a role'; end if;
end $$;

reset role;

-- Deleting the auth user removes the staff row (on delete cascade).
delete from auth.users where id = '00000000-0000-4000-8000-0000000000a1';
do $$
begin
  if exists (select 1 from public.staff_members where user_id = '00000000-0000-4000-8000-0000000000a1') then
    raise exception 'staff row survived deletion of its user';
  end if;
end $$;

-- The role enum accepts only the two roles.
do $$
begin
  begin
    insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000b1');
    insert into public.staff_members (user_id, role) values ('00000000-0000-4000-8000-0000000000b1', 'superuser');
  exception when invalid_text_representation then
    return;
  end;
  raise exception 'an unknown role was accepted';
end $$;

select 'staff_roles.test.sql: all assertions passed' as result;

rollback;
