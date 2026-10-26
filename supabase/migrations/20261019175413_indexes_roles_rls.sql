-- Day 9: spatial/search/filter indexes, full hierarchy-cycle detection,
-- database roles and Row Level Security policies for the Day 8 schema.
--
-- Schema this builds on: supabase/migrations/20261012195606_initial_heritage_schema.sql
-- Index/query contract:  docs/DATA_MODEL.md "Index and query requirements"
-- RLS/role contract:     docs/ARCHITECTURE.md ("Use Supabase Row Level
--                         Security as a mandatory boundary, not an optional
--                         hardening step")
--
-- Scope decisions made while writing this migration (flagged for Codex
-- review, same discipline as every prior day's handoff):
--
-- 1. "Roles" here means wiring grants and policies for the roles Supabase
--    already provisions on every project (anon, authenticated, service_role)
--    - no new custom roles are created. TODO.md's Day 21 entry is the one
--    that "defines administrator and editor permissions"; building a staff
--    role system now, before there is any login, profile table or claim to
--    tell an editor apart from an ordinary visitor, would mean guessing at
--    a shape Day 21 should actually decide. service_role bypasses RLS by
--    Supabase's own design, so every write path (Day 10's importer today,
--    Day 22's admin forms later) continues to route through it: this
--    migration adds zero insert/update/delete policies on any table, so
--    nothing except service_role can write.
--
-- 2. anon and authenticated receive identical read access for now (published
--    objects only; object_contacts additionally requires visibility =
--    'public'). Until Day 21 creates a real distinction between an ordinary
--    signed-in visitor and platform staff, there is no column to tell them
--    apart, so authenticated is deliberately treated exactly like anon
--    rather than guessing at a broader grant. Revisit once Day 21 lands.
--
-- 3. object_cadastre_references uses the same "published parent only" read
--    policy as the other child tables, even though no documented page
--    currently plans to display cadastral references publicly -
--    docs/DATA_MODEL.md treats it as reference/verification metadata, not
--    explicitly public or private content. Flagged for Codex review;
--    tightening this to service_role-only is a one-line change later if
--    product decides it should not be public.
--
-- 4. The GIN/trigram "multilingual name/location search" requirement is
--    implemented as direct trigram indexes on heritage_objects.name_lv,
--    heritage_objects.municipality and object_names.name, rather than
--    building a maintained cross-table "search document" column today.
--    docs/DATA_MODEL.md describes a single maintained document spanning
--    both tables, but the real query shape (JOIN vs UNION vs a
--    trigger-maintained denormalized column) should be driven by Day 16's
--    actual search implementation, not guessed at here. These three indexes
--    let Day 16 query either shape without a migration just to add indexes.
--
-- 5. Full multi-level parent/child cycle prevention is implemented as a
--    BEFORE INSERT OR UPDATE OF parent_object_id trigger that walks the
--    whole ancestor chain. It correctly blocks a cycle assembled within one
--    transaction (including the two-statement case: set A's parent to B,
--    then B's parent to A, in the same transaction). Like any trigger-based
--    check without explicit locking or SERIALIZABLE isolation, it cannot
--    fully prevent a cycle assembled by two genuinely concurrent
--    transactions that each pass their check before either commits.
--    Hierarchy edits are a rare, low-concurrency admin operation - and there
--    is no public write path at all yet (see decision 1) - so this is noted
--    as an accepted limitation rather than engineered around with explicit
--    locking now.
--
-- 6. pg_trgm is installed into the same dedicated `extensions` schema as
--    PostGIS, not `public`, for the same reason docs/SUPABASE_SETUP.md gives
--    for PostGIS: keep `public`'s Data API surface free of extension-owned
--    objects.
--
-- Tested locally against Postgres 16 + PostGIS 3.4 + pg_trgm, replaying the
-- Day 8 migration first, with roles anon/authenticated/service_role created
-- to mirror what a real Supabase project already provisions - see this
-- session's verification notes (docs/DAY9_MIGRATION_NOTES.md) for the exact
-- test script.

begin;

-- ---------------------------------------------------------------------------
-- 0. Extensions (idempotent; see decision 6 above)
-- ---------------------------------------------------------------------------

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Spatial, filter and foreign-key indexes
--    (docs/DATA_MODEL.md "Index and query requirements"; the unique indexes
--    that section also asks for - slug, (source_system,external_source_id),
--    (object_id,reference_type,reference_value) - already exist as unique
--    constraints from the Day 8 migration)
-- ---------------------------------------------------------------------------

-- GiST index on location for viewport and distance queries.
create index heritage_objects_location_gist_idx
  on heritage_objects using gist (location);

-- B-tree indexes matching published-directory filters.
create index heritage_objects_status_idx
  on heritage_objects (status);
create index heritage_objects_object_type_idx
  on heritage_objects (object_type);
create index heritage_objects_municipality_idx
  on heritage_objects (municipality);
create index heritage_objects_condition_category_idx
  on heritage_objects (condition_category);
create index heritage_objects_ownership_type_idx
  on heritage_objects (ownership_type);
create index heritage_objects_parent_object_id_idx
  on heritage_objects (parent_object_id);

-- Foreign-key indexes on every child table's object_id. Postgres does not
-- index foreign keys automatically; docs/DATA_MODEL.md: "Admin relations use
-- foreign-key indexes and paginated queries." These also speed up the
-- on-delete-cascade lookups the Day 8 migration relies on.
create index object_names_object_id_idx
  on object_names (object_id);
create index object_historical_owner_families_object_id_idx
  on object_historical_owner_families (object_id);
create index object_contacts_object_id_idx
  on object_contacts (object_id);
create index object_cadastre_references_object_id_idx
  on object_cadastre_references (object_id);

-- GIN/trigram search support (see decision 4 above).
create index heritage_objects_name_lv_trgm_idx
  on heritage_objects using gin (name_lv extensions.gin_trgm_ops);
create index heritage_objects_municipality_trgm_idx
  on heritage_objects using gin (municipality extensions.gin_trgm_ops);
create index object_names_name_trgm_idx
  on object_names using gin (name extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 2. Full parent/child hierarchy-cycle detection (see decision 5 above)
-- ---------------------------------------------------------------------------

create function prevent_hierarchy_cycle() returns trigger as $$
declare
  current_id uuid;
  depth int := 0;
  max_depth constant int := 1000;
begin
  if new.parent_object_id is null then
    return new;
  end if;

  current_id := new.parent_object_id;

  while current_id is not null loop
    if current_id = new.id then
      raise exception
        'heritage_objects: setting parent_object_id to % would create a parent/child cycle for object %',
        new.parent_object_id, new.id;
    end if;

    depth := depth + 1;
    if depth > max_depth then
      raise exception
        'heritage_objects: parent chain exceeded % levels while checking object % for cycles - refusing to walk a chain this deep',
        max_depth, new.id;
    end if;

    select parent_object_id into current_id
      from heritage_objects
      where id = current_id;
  end loop;

  return new;
end;
$$ language plpgsql;

comment on function prevent_hierarchy_cycle() is
  'Walks the full parent_object_id ancestor chain on insert/update to block multi-level cycles, not just direct self-parenting (which heritage_objects_no_self_parent already covers). See this migration''s header, decision 5, for its concurrency limitation.';

create trigger heritage_objects_prevent_cycle
  before insert or update of parent_object_id on heritage_objects
  for each row
  execute function prevent_hierarchy_cycle();

-- ---------------------------------------------------------------------------
-- 3. Roles and Row Level Security policies (see decisions 1-3 above)
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select on heritage_objects to anon, authenticated;
grant select on object_names to anon, authenticated;
grant select on object_historical_owner_families to anon, authenticated;
grant select on object_contacts to anon, authenticated;
grant select on object_cadastre_references to anon, authenticated;

-- Defensive, explicit denial of write access, even though no policy below
-- grants it either: belt-and-suspenders for docs/ARCHITECTURE.md's "RLS as
-- a mandatory boundary, not an optional hardening step."
revoke insert, update, delete, truncate, references, trigger
  on heritage_objects, object_names, object_historical_owner_families,
     object_contacts, object_cadastre_references
  from anon, authenticated;

create policy heritage_objects_select_published
  on heritage_objects
  for select
  to anon, authenticated
  using (status = 'published');

create policy object_names_select_for_published_objects
  on object_names
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from heritage_objects ho
      where ho.id = object_names.object_id
        and ho.status = 'published'
    )
  );

create policy object_historical_owner_families_select_for_published_objects
  on object_historical_owner_families
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from heritage_objects ho
      where ho.id = object_historical_owner_families.object_id
        and ho.status = 'published'
    )
  );

create policy object_contacts_select_public_for_published_objects
  on object_contacts
  for select
  to anon, authenticated
  using (
    visibility = 'public'
    and exists (
      select 1
      from heritage_objects ho
      where ho.id = object_contacts.object_id
        and ho.status = 'published'
    )
  );

create policy object_cadastre_references_select_for_published_objects
  on object_cadastre_references
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from heritage_objects ho
      where ho.id = object_cadastre_references.object_id
        and ho.status = 'published'
    )
  );

commit;
