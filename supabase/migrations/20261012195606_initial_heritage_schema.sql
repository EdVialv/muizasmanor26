-- Day 8: first migration for heritage objects, hierarchy, classifications,
-- contacts, sources and families.
--
-- Schema contract: docs/DATA_MODEL.md
-- Import scope/rules contract: docs/DAY6_NORMALIZATION_RULES.md
--
-- Scope decisions made while writing this migration (flagged for Codex review,
-- same discipline as every prior day's handoff):
--
-- 1. heritage_objects enforces every field docs/DATA_MODEL.md's "Required
--    fields" section lists as required (name_lv, slug, summary_lv,
--    municipality, latitude, longitude, source_url, last_verified_at,
--    object_type, status) as NOT NULL. This makes heritage_objects itself the
--    canonical/published-track table: a row that does not yet satisfy the
--    contract cannot be inserted here at all. docs/DAY6_NORMALIZATION_RULES.md
--    section 5 explicitly requires this ("must not silently create a
--    canonical object that violates the contract") and describes a separate
--    staging/review state machine (archived_out_of_scope / needs_review /
--    ready_for_import / imported) for everything that does not yet qualify.
--    That staging schema is intentionally NOT created in this migration - it
--    belongs with Day 10's importer, which needs to co-design its shape with
--    the actual import code rather than have it guessed at in isolation here.
--
-- 2. object_images and object_booking_integrations are deliberately NOT
--    created in this migration. TODO.md's Day 8 entry scopes this migration
--    to "heritage objects, hierarchy, classifications, contacts, sources and
--    families" only. object_images is still an explicit "proposal" in
--    docs/DAY6_NORMALIZATION_RULES.md section 6, not yet a reviewed part of
--    docs/DATA_MODEL.md's own contract, and is needed before Day 10 ("load
--    the representative sample") rather than before Day 8.
--    object_booking_integrations is explicitly a post-validation module per
--    docs/MVP_SCOPE.md and is not scheduled anywhere in TODO.md's 30-evening
--    roadmap yet.
--
-- 3. "historical_owner_families" is implemented as a single association
--    table (object_historical_owner_families) rather than a master families
--    table plus a join table. docs/DATA_MODEL.md's own wording ("Each
--    association supports: family or dynasty name; alternate spellings; ...")
--    lists the family/dynasty name itself as a per-association attribute, not
--    as a separate normalised entity with its own schema - there is no
--    documented master-table shape to build against. This is a judgement
--    call; flag for Codex review.
--
-- 4. Row Level Security is enabled on every table in this migration, with NO
--    policies defined yet (so every table is fully locked to the Data API
--    for now). docs/ARCHITECTURE.md calls RLS "a mandatory boundary, not an
--    optional hardening step" - this migration follows that by never letting
--    a table exist without RLS enabled, even for a moment. Day 9 ("roles and
--    Row Level Security") adds the actual policies and roles.
--
-- 5. Multi-level parent/child cycle prevention is NOT implemented here beyond
--    a trivial CHECK blocking direct self-parenting (id <> parent_object_id).
--    Full cycle detection needs either a recursive trigger or periodic
--    validation; TODO.md's Day 9 entry explicitly lists "constraints"
--    alongside indexes and RLS, so the complete guard is deferred there
--    rather than added speculatively now.
--
-- Tested locally against Postgres 16 + PostGIS 3.4, with PostGIS installed
-- into a dedicated `extensions` schema (matching docs/SUPABASE_SETUP.md's
-- real setup, not the `public` schema) - see this session's verification
-- notes for the exact test script.

begin;

-- ---------------------------------------------------------------------------
-- 0. Extensions (idempotent; docs/SUPABASE_SETUP.md already enabled this
--    manually on the real project, but this migration stays self-contained
--    so it can be replayed on a fresh database, e.g. for CI or local testing)
-- ---------------------------------------------------------------------------

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Enum types
-- ---------------------------------------------------------------------------

create type object_type as enum (
  'manor_estate',
  'manor_house',
  'palace_or_castle',
  'park_or_garden',
  'ruin_or_historical_site',
  'outbuilding',
  'other_heritage_object'
);

create type object_status as enum (
  'draft',
  'review',
  'published',
  'archived'
);

create type condition_category as enum (
  'historical_site',
  'damaged',
  'class_b',
  'class_a'
);

create type ownership_type as enum (
  'private_person',
  'private_legal_entity',
  'municipality',
  'state'
);

create type cadastre_reference_type as enum (
  'real_estate_number',
  'land_unit_designation',
  'building_designation',
  'premises_group_designation'
);

create type cadastre_match_method as enum (
  'manual_lookup',
  'api_match',
  'imported_dataset'
);

create type contact_type as enum (
  'email',
  'phone',
  'website',
  'address',
  'social',
  'booking'
);

create type contact_purpose as enum (
  'general',
  'events',
  'sales',
  'press',
  'administration'
);

create type contact_visibility as enum (
  'public',
  'internal'
);

create type object_name_type as enum (
  'alternate',
  'historical'
);

-- Shared by object_names.verification_status and
-- object_historical_owner_families.verification_status - docs/DATA_MODEL.md
-- and docs/DAY6_NORMALIZATION_RULES.md describe the same two-state
-- verification idea in both places without giving it a distinct name.
create type verification_status as enum (
  'unverified',
  'verified'
);

-- ---------------------------------------------------------------------------
-- 2. Shared trigger function for updated_at (docs/DATA_MODEL.md: "created_at
--    and updated_at are required for audit and cache invalidation")
-- ---------------------------------------------------------------------------

create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- 3. heritage_objects - core table + hierarchy + inline classification fields
-- ---------------------------------------------------------------------------

create table heritage_objects (
  id uuid primary key default gen_random_uuid(),

  -- Object identity and hierarchy
  source_system text not null,
  external_source_id text not null,
  object_type object_type not null,
  parent_object_id uuid references heritage_objects (id) on delete set null,
  slug text not null,

  -- Required fields
  name_lv text not null,
  summary_lv text not null,
  municipality text not null,
  latitude numeric not null check (latitude between -90 and 90),
  longitude numeric not null check (longitude between -180 and 180),
  -- Generated from latitude/longitude rather than set independently, per
  -- docs/DATA_MODEL.md ("generated or validated from coordinates"). Schema
  -- is qualified explicitly (extensions.*) because PostGIS is installed in
  -- the `extensions` schema, not `public` - see docs/SUPABASE_SETUP.md.
  location extensions.geography(point, 4326)
    generated always as (
      extensions.st_setsrid(
        extensions.st_makepoint(longitude, latitude),
        4326
      )::extensions.geography
    ) stored,
  status object_status not null default 'draft',
  source_url text not null,
  last_verified_at timestamptz not null,

  -- Classification fields used by filters
  condition_category condition_category,
  condition_notes_lv text,
  ownership_type ownership_type,
  ownership_verified_at date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint heritage_objects_source_unique unique (source_system, external_source_id),
  constraint heritage_objects_slug_unique unique (slug),
  -- Blocks direct self-parenting only; see decision 5 above for why a full
  -- multi-level cycle guard is deferred to Day 9.
  constraint heritage_objects_no_self_parent check (id <> parent_object_id)
);

comment on table heritage_objects is
  'Canonical, publish-track heritage objects. Every NOT NULL column here is a field docs/DATA_MODEL.md lists as required; a candidate record that does not yet satisfy them belongs in Day 10''s staging/review mechanism, not in this table.';

create trigger heritage_objects_set_updated_at
  before update on heritage_objects
  for each row
  execute function set_updated_at();

alter table heritage_objects enable row level security;

-- ---------------------------------------------------------------------------
-- 4. object_names - alternate/historical name candidates
--    (docs/DAY6_NORMALIZATION_RULES.md section 2 and "Open items")
-- ---------------------------------------------------------------------------

create table object_names (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references heritage_objects (id) on delete cascade,
  name text not null,
  name_type object_name_type not null,
  language_code text,
  verification_status verification_status not null default 'unverified',
  source_url text,
  verified_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint object_names_unique unique (object_id, name, name_type)
);

comment on table object_names is
  'Alternate and historical name candidates split out of the source title (docs/DAY6_NORMALIZATION_RULES.md section 2). A name appearing here, even with verification_status = verified, is not itself a public claim until an editor uses it.';

create trigger object_names_set_updated_at
  before update on object_names
  for each row
  execute function set_updated_at();

alter table object_names enable row level security;

-- ---------------------------------------------------------------------------
-- 5. object_historical_owner_families
--    (docs/DATA_MODEL.md "Historical owner families" - see decision 3 above)
-- ---------------------------------------------------------------------------

create table object_historical_owner_families (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references heritage_objects (id) on delete cascade,
  family_name text not null,
  alternate_spellings text[],
  start_year_approx integer,
  end_year_approx integer,
  source_url text,
  verification_status verification_status not null default 'unverified',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint object_historical_owner_families_year_order
    check (
      start_year_approx is null
      or end_year_approx is null
      or end_year_approx >= start_year_approx
    )
);

comment on table object_historical_owner_families is
  'One row per family/dynasty association for one object, across however many periods apply. No separate master-family registry table exists yet - docs/DATA_MODEL.md does not specify one; see this migration''s header for the judgement call.';

create trigger object_historical_owner_families_set_updated_at
  before update on object_historical_owner_families
  for each row
  execute function set_updated_at();

alter table object_historical_owner_families enable row level security;

-- ---------------------------------------------------------------------------
-- 6. object_contacts
--    (docs/DATA_MODEL.md "Contact information")
-- ---------------------------------------------------------------------------

create table object_contacts (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references heritage_objects (id) on delete cascade,
  contact_type contact_type not null,
  label text not null,
  contact_value text not null,
  purpose contact_purpose not null,
  -- Defaults to the more private option; a reviewed, explicit decision is
  -- required to make a contact public, per docs/DATA_MODEL.md's rule that
  -- "personal data must not be published without a documented lawful basis."
  visibility contact_visibility not null default 'internal',
  is_primary boolean not null default false,
  verified_at timestamptz,
  source_url text,
  legal_basis_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table object_contacts is
  'Public and internal enquiry-routing contacts, kept in one relation but distinguished by visibility. docs/DATA_MODEL.md requires legal_basis_note "when personal contact data is stored or published" - that condition is not enforced as a DB constraint here, since it depends on judgement about what counts as personal data; it is an application-level rule.';

create trigger object_contacts_set_updated_at
  before update on object_contacts
  for each row
  execute function set_updated_at();

alter table object_contacts enable row level security;

-- ---------------------------------------------------------------------------
-- 7. object_cadastre_references
--    (docs/DATA_MODEL.md "Cadastral cross-references")
-- ---------------------------------------------------------------------------

create table object_cadastre_references (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references heritage_objects (id) on delete cascade,
  reference_type cadastre_reference_type not null,
  reference_value text not null,
  is_primary boolean not null default false,
  verified_at date,
  source_url text,
  match_method cadastre_match_method not null,
  match_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Exactly the uniqueness rule docs/DATA_MODEL.md specifies: "Enforce
  -- uniqueness on (object_id, reference_type, reference_value), not globally
  -- on the reference value."
  constraint object_cadastre_references_unique
    unique (object_id, reference_type, reference_value)
);

comment on table object_cadastre_references is
  'Cadastral cross-references. Never populate reference_value from an approximate-coordinate guess - docs/DATA_MODEL.md requires a verified official lookup or dataset match.';

create trigger object_cadastre_references_set_updated_at
  before update on object_cadastre_references
  for each row
  execute function set_updated_at();

alter table object_cadastre_references enable row level security;

commit;
