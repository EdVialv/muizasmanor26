-- Day 21 regression test: staff roles and Row Level Security
-- (docs/DAY21_AUTH_PERMISSIONS_NOTES.md; migration 20261119090000_staff_roles.sql).
--
-- Checks, as the database itself enforces them:
--   - anon: no access to staff_members; published objects only;
--   - a signed-in user without a staff role: no staff rows, published only,
--     even with "role": "administrator" in user_metadata / app_metadata;
--   - an editor: their own staff row only; every object status;
--   - an administrator: every staff row; every object status;
--   - nobody can insert, update, delete or truncate staff_members through
--     the API roles - the full matrix for anon, non-staff, editor and
--     administrator - so no one can grant, escalate or revoke a role;
--   - every public object-derived function (search_public_heritage_objects,
--     public_map_objects, public_directory_municipalities,
--     public_directory_historical_families) still returns published
--     objects only when called as an editor: draft and review objects
--     change no returned row, municipality count or family option.
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

-- Fixtures: three users with fixed, obviously fake ids and .invalid
-- addresses; one draft, one review, one published object named
-- "Kvazistaff ...", each in its own fake municipality, plus a second draft
-- in the published object's municipality; verified family links that tie
-- one family to the published object and the drafts, and another only to
-- the draft and review objects.
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
  ('staff_test', 'st-draft', 'manor_house', 'st-draft', 'Kvazistaff melnraksts', '[Testa dati]', 'Kvazistaff melnrakstu novads', 57.1, 26.1, 'draft', 'https://example.invalid/st', '2026-11-01'),
  ('staff_test', 'st-review', 'manor_house', 'st-review', 'Kvazistaff pārskatīšanā', '[Testa dati]', 'Kvazistaff pārskata novads', 57.1, 26.1, 'review', 'https://example.invalid/st', '2026-11-01'),
  ('staff_test', 'st-published', 'manor_house', 'st-published', 'Kvazistaff publicēts', '[Testa dati]', 'Kvazistaff publicētais novads', 57.1, 26.1, 'published', 'https://example.invalid/st', '2026-11-01'),
  ('staff_test', 'st-draft-2', 'manor_house', 'st-draft-2', 'Kvazistaff otrais melnraksts', '[Testa dati]', 'Kvazistaff publicētais novads', 57.1, 26.1, 'draft', 'https://example.invalid/st', '2026-11-01');

insert into object_historical_owner_families (object_id, family_name, verification_status)
select ho.id, f.family_name, 'verified'
from heritage_objects ho
join (values
  ('st-published', 'Kvazistaff publiskā dzimta'),
  ('st-draft', 'Kvazistaff publiskā dzimta'),
  ('st-draft-2', 'Kvazistaff publiskā dzimta'),
  ('st-draft', 'Kvazistaff slēptā dzimta'),
  ('st-review', 'Kvazistaff slēptā dzimta')
) as f (slug, family_name) on f.slug = ho.slug;

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

-- The complete write matrix on staff_members for the current API role.
create function pg_temp.expect_no_staff_writes(who text) returns void
language plpgsql as $$
begin
  perform pg_temp.expect_denied(
    $q$insert into public.staff_members (user_id, role) values ('00000000-0000-4000-8000-0000000000c1', 'administrator')$q$,
    who || ': INSERT into staff_members');
  perform pg_temp.expect_denied(
    $q$update public.staff_members set role = 'administrator'$q$,
    who || ': UPDATE staff_members');
  perform pg_temp.expect_denied(
    $q$delete from public.staff_members$q$,
    who || ': DELETE from staff_members');
  perform pg_temp.expect_denied(
    $q$truncate public.staff_members$q$,
    who || ': TRUNCATE staff_members');
end;
$$;

grant execute on function pg_temp.expect_denied(text, text) to anon, authenticated;
grant execute on function pg_temp.expect_no_staff_writes(text) to anon, authenticated;
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
select pg_temp.expect_no_staff_writes('anon');

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
select pg_temp.expect_no_staff_writes('non-staff user');

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
  if n <> 4 then raise exception 'editor sees % staff_test objects (expected 4: two drafts, review, published)', n; end if;
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

select pg_temp.expect_no_staff_writes('editor');

-- Every public object-derived function stays published-only, even though
-- the editor can now read draft and review rows directly.
do $$
declare
  n int;
  slugs text[];
  municipality_counts jsonb;
  families jsonb;
begin
  -- 1. Directory search.
  select array_agg(s.slug order by s.slug) into slugs
    from public.search_public_heritage_objects(search_query => 'kvazistaff') s;
  if slugs is distinct from array['st-published'] then
    raise exception 'search_public_heritage_objects returns % for an editor (expected only st-published)', slugs;
  end if;

  -- 2. Map viewport (objects mode).
  select count(*), array_agg(m.slug order by m.slug) into n, slugs
    from public.public_map_objects(25.0, 56.5, 27.0, 57.5, 12, search_query => 'kvazistaff') m;
  if n <> 1 or slugs is distinct from array['st-published'] then
    raise exception 'public_map_objects returns % rows (%) for an editor (expected only st-published)', n, slugs;
  end if;

  -- 3. Region options: no draft-only or review-only municipality, and the
  --    second draft does not inflate the published municipality's count.
  select coalesce(jsonb_object_agg(m.municipality, m.object_count), '{}'::jsonb) into municipality_counts
    from public.public_directory_municipalities() m
   where m.municipality like 'Kvazistaff %';
  if municipality_counts <> '{"Kvazistaff publicētais novads": 1}'::jsonb then
    raise exception 'public_directory_municipalities returns % for an editor (expected only the published municipality, count 1)',
      municipality_counts;
  end if;

  -- 4. Family options: no family linked only to draft/review objects, and
  --    the drafts do not inflate the published family's count.
  select coalesce(jsonb_object_agg(f.family_name, f.object_count), '{}'::jsonb) into families
    from public.public_directory_historical_families('kvazistaff', 20) f;
  if families <> '{"Kvazistaff publiskā dzimta": 1}'::jsonb then
    raise exception 'public_directory_historical_families returns % for an editor (expected only the published family, count 1)',
      families;
  end if;
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
  if n <> 4 then raise exception 'administrator sees % staff_test objects (expected 4)', n; end if;
end $$;

-- Roles are provisioned outside the application, even by administrators.
select pg_temp.expect_denied(
  $q$insert into public.staff_members (user_id, role) values ('00000000-0000-4000-8000-0000000000c1', 'editor')$q$,
  'administrator grants a role through the API');
select pg_temp.expect_denied(
  $q$update public.staff_members set role = 'editor' where user_id = '00000000-0000-4000-8000-0000000000e1'$q$,
  'administrator changes a role through the API');
select pg_temp.expect_denied(
  $q$delete from public.staff_members where user_id = '00000000-0000-4000-8000-0000000000e1'$q$,
  'administrator revokes a role through the API');
select pg_temp.expect_no_staff_writes('administrator');

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
