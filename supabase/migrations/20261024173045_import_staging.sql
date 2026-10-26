-- Day 10: import staging table and a promotion function, so the importer
-- never writes an incomplete candidate straight into the canonical tables.
--
-- Schema this builds on: supabase/migrations/20261012195606_initial_heritage_schema.sql
--                         supabase/migrations/20261019175413_indexes_roles_rls.sql
-- Staging-state-machine contract: docs/DAY6_NORMALIZATION_RULES.md section 5
-- Importer this backs: scripts/import/ (docs/DAY10_IMPORTER_NOTES.md)
--
-- Scope decisions made while writing this migration (flagged for Codex
-- review, same discipline as every prior day's handoff):
--
-- 1. The four states this table's `status` column uses are exactly
--    docs/DAY6_NORMALIZATION_RULES.md section 5's state machine
--    (archived_out_of_scope / needs_review / ready_for_import / imported),
--    named `import_row_status` here rather than reusing `object_status`
--    (which models a *published* object's lifecycle - draft/review/
--    published/archived - a different concept at a different layer).
--
-- 2. One staging table covers every object candidate, with the resolved
--    scalar fields inlined (mirroring heritage_objects' own columns) plus
--    `historical_owner_families` and `cadastre_references` as jsonb arrays
--    rather than their own staging tables. Neither sub-relation has a
--    not-null or uniqueness rule that matters before promotion, and keeping
--    them as jsonb lets the importer stage a whole candidate - core fields
--    and associated relations alike - in one upsert per source row, which
--    is what makes the (source_system, external_source_id) idempotency key
--    simple to reason about. `raw_payload` keeps the untouched source row
--    alongside the resolved fields, satisfying docs/DAY6_NORMALIZATION_RULES.md
--    section 5's "every source row is retained in a raw/archive table."
--
-- 3. `raw_payload_hash` exists purely so a resumed/re-run import can tell
--    "this source row is byte-identical to what is already staged" from
--    "this source row changed since the last run" without re-deriving and
--    re-comparing every resolved field. docs/ARCHITECTURE.md requires
--    imports to be "idempotent, batched, resumable"; the upsert key alone
--    gives idempotency, but this hash is what lets a resumed run skip
--    already-processed rows cheaply instead of only safely.
--
-- 4. `promote_staging_row(uuid)` lives in the database, not in the importer
--    script, so "insert into heritage_objects plus its family/cadastre
--    children, then mark this staging row imported" is one atomic unit a
--    caller cannot partially apply, and so it can be exercised directly
--    from psql the same way every prior migration's constraints were
--    verified. It always inserts with heritage_objects.status left at its
--    table default ('draft') - this function never sets a row to
--    'published' itself. Publishing is an editorial act (Day 22+), not an
--    import side effect, and docs/DATA_MODEL.md's "publishing requires a
--    source and verification date" is a precondition, not a promotion.
--
-- 5. Parent linkage resolves through this same staging table: a staging
--    row's `parent_external_source_id` is looked up as another staging
--    row's `external_source_id` (same `source_system`), and promotion only
--    succeeds once that parent row's `imported_object_id` is populated. A
--    child whose parent has not been promoted yet raises a distinct,
--    recognisable exception (SQLSTATE 'MM001') so the calling importer can
--    retry it later in the same run rather than treating it as a hard
--    failure - see scripts/import/db.ts's promotion loop.
--
-- 6. RLS is enabled on staging_heritage_objects with no policies, same as
--    every canonical table before Day 9 added policies to them. Staging
--    data is never meant for public or authenticated reads at all - not
--    even once promoted, since the promoted object itself is what anon/
--    authenticated should read, with its own Day 9 policy - so unlike the
--    canonical tables, no policy is ever expected here; only service_role
--    (which bypasses RLS) runs the importer.

begin;

-- ---------------------------------------------------------------------------
-- 1. Staging state-machine enum (see decision 1 above)
-- ---------------------------------------------------------------------------

create type import_row_status as enum (
  'archived_out_of_scope',
  'needs_review',
  'ready_for_import',
  'imported'
);

-- ---------------------------------------------------------------------------
-- 2. staging_heritage_objects
-- ---------------------------------------------------------------------------

create table staging_heritage_objects (
  id uuid primary key default gen_random_uuid(),

  -- Stable identity, same shape as heritage_objects' own import key.
  source_system text not null,
  external_source_id text not null,

  status import_row_status not null default 'needs_review',
  status_reason text,

  -- Untouched source row plus a content hash for cheap resume (decisions 2-3).
  raw_payload jsonb not null,
  raw_payload_hash text not null,

  -- Resolved candidate fields, mirroring heritage_objects' own columns.
  object_type object_type,
  parent_external_source_id text,
  name_lv text,
  slug text,
  summary_lv text,
  municipality text,
  latitude numeric,
  longitude numeric,
  source_url text,
  last_verified_at timestamptz,
  condition_category condition_category,
  ownership_type ownership_type,
  ownership_verified_at date,

  -- Resolved associated-relation candidates (decision 2).
  historical_owner_families jsonb not null default '[]'::jsonb,
  cadastre_references jsonb not null default '[]'::jsonb,

  -- Set once promote_staging_row() succeeds for this row.
  imported_object_id uuid references heritage_objects (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint staging_heritage_objects_unique unique (source_system, external_source_id),
  constraint staging_heritage_objects_latitude_range
    check (latitude is null or latitude between -90 and 90),
  constraint staging_heritage_objects_longitude_range
    check (longitude is null or longitude between -180 and 180),
  constraint staging_heritage_objects_ready_fields
    check (
      status not in ('ready_for_import', 'imported')
      or (
        object_type is not null
        and nullif(btrim(name_lv), '') is not null
        and nullif(btrim(slug), '') is not null
        and nullif(btrim(summary_lv), '') is not null
        and nullif(btrim(municipality), '') is not null
        and latitude is not null
        and longitude is not null
        and nullif(btrim(source_url), '') is not null
        and last_verified_at is not null
      )
    )
);

comment on table staging_heritage_objects is
  'One row per import-candidate source record, in whichever of docs/DAY6_NORMALIZATION_RULES.md section 5''s four states it currently satisfies. Promotion to heritage_objects happens only through promote_staging_row(), never by direct application insert.';

create trigger staging_heritage_objects_set_updated_at
  before update on staging_heritage_objects
  for each row
  execute function set_updated_at();

alter table staging_heritage_objects enable row level security;

-- Functions are executable by PUBLIC unless explicitly revoked. The
-- promotion function is an administrative import primitive and must not be
-- exposed as a callable RPC to Data API roles.
revoke all on staging_heritage_objects from public, anon, authenticated;

create index staging_heritage_objects_status_idx
  on staging_heritage_objects (status);
create index staging_heritage_objects_parent_external_source_id_idx
  on staging_heritage_objects (source_system, parent_external_source_id);

-- ---------------------------------------------------------------------------
-- 3. Promotion function (see decisions 4-5 above)
-- ---------------------------------------------------------------------------

create function promote_staging_row(p_staging_id uuid) returns uuid as $$
declare
  v_row staging_heritage_objects;
  v_parent_object_id uuid;
  v_object_id uuid;
  v_family jsonb;
  v_cadastre jsonb;
begin
  select * into v_row from staging_heritage_objects where id = p_staging_id for update;

  if v_row.id is null then
    raise exception 'promote_staging_row: no staging_heritage_objects row with id %', p_staging_id;
  end if;

  if v_row.status <> 'ready_for_import' then
    raise exception 'promote_staging_row: staging row % is % not ready_for_import', p_staging_id, v_row.status;
  end if;

  if v_row.parent_external_source_id is not null then
    select imported_object_id into v_parent_object_id
      from staging_heritage_objects
      where source_system = v_row.source_system
        and external_source_id = v_row.parent_external_source_id;

    if v_parent_object_id is null then
      raise exception using
        errcode = 'MM001',
        message = format(
          'promote_staging_row: parent %s for staging row %s is not promoted yet',
          v_row.parent_external_source_id, p_staging_id
        );
    end if;
  end if;

  insert into heritage_objects (
    source_system, external_source_id, object_type, parent_object_id, slug,
    name_lv, summary_lv, municipality, latitude, longitude, source_url,
    last_verified_at, condition_category, ownership_type, ownership_verified_at
  ) values (
    v_row.source_system, v_row.external_source_id, v_row.object_type, v_parent_object_id, v_row.slug,
    v_row.name_lv, v_row.summary_lv, v_row.municipality, v_row.latitude, v_row.longitude, v_row.source_url,
    v_row.last_verified_at, v_row.condition_category, v_row.ownership_type, v_row.ownership_verified_at
  )
  on conflict (source_system, external_source_id) do update set
    object_type = excluded.object_type,
    parent_object_id = excluded.parent_object_id,
    slug = excluded.slug,
    name_lv = excluded.name_lv,
    summary_lv = excluded.summary_lv,
    municipality = excluded.municipality,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    source_url = excluded.source_url,
    last_verified_at = excluded.last_verified_at,
    condition_category = excluded.condition_category,
    ownership_type = excluded.ownership_type,
    ownership_verified_at = excluded.ownership_verified_at
  returning id into v_object_id;

  for v_family in select * from jsonb_array_elements(v_row.historical_owner_families)
  loop
    insert into object_historical_owner_families (
      object_id, family_name, source_url, verification_status
    ) values (
      v_object_id,
      v_family ->> 'family_name',
      v_family ->> 'source_url',
      coalesce((v_family ->> 'verification_status')::verification_status, 'unverified')
    )
    where not exists (
      select 1
      from object_historical_owner_families existing
      where existing.object_id = v_object_id
        and existing.family_name = (v_family ->> 'family_name')
        and existing.source_url is not distinct from (v_family ->> 'source_url')
    );
  end loop;

  for v_cadastre in select * from jsonb_array_elements(v_row.cadastre_references)
  loop
    insert into object_cadastre_references (
      object_id, reference_type, reference_value, match_method, source_url
    ) values (
      v_object_id,
      (v_cadastre ->> 'reference_type')::cadastre_reference_type,
      v_cadastre ->> 'reference_value',
      (v_cadastre ->> 'match_method')::cadastre_match_method,
      v_cadastre ->> 'source_url'
    )
    on conflict (object_id, reference_type, reference_value) do nothing;
  end loop;

  update staging_heritage_objects
    set status = 'imported', imported_object_id = v_object_id
    where id = p_staging_id;

  return v_object_id;
end;
$$ language plpgsql;

revoke all on function promote_staging_row(uuid) from public, anon, authenticated;

comment on function promote_staging_row(uuid) is
  'Inserts (or re-syncs, on conflict) one staging row into heritage_objects and its historical-owner-family/cadastre-reference children, resolving parent_object_id through this same staging table. Raises SQLSTATE MM001 if the row''s parent has not been promoted yet - callers should retry those rows after the rest of the current pass completes. Never sets heritage_objects.status itself; see this migration''s header, decision 4.';

commit;
