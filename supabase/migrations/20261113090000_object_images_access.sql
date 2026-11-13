-- Day 15: per-object images, and visitor-access / accessibility fields.
--
-- Builds on: supabase/migrations/20261012195606_initial_heritage_schema.sql
--            supabase/migrations/20261019175413_indexes_roles_rls.sql
-- Image contract:  docs/DAY6_NORMALIZATION_RULES.md section 6 (the reviewed
--                  object_images proposal) and docs/DATA_MODEL.md
--                  ("Image records with credit, rights, alt text ...").
-- Notes:           docs/DAY15_VISUAL_ALPHA_NOTES.md
--
-- NOT APPLIED ANYWHERE by the session that wrote it. It was exercised only
-- against a disposable local PostgreSQL 16 + PostGIS database. Apply it to
-- muizasmanor26-dev after review, BEFORE deploying the Day 15 application
-- code: that code selects the new heritage_objects columns and embeds
-- object_images, so it fails against a database without this migration.
-- The migration itself is additive (new table, new nullable columns) and
-- safe to apply while the Day 13/14 code is still running.
--
-- Decisions made while writing this migration (flagged for Codex review):
--
-- 1. source_image_url is the image the public site displays. The Day 6
--    proposal says to keep it "for provenance" and not to hotlink it as the
--    product asset. The dataset owner has since directed (2026-11-13) that
--    the pictures are to be accessed through this column ("Attēla
--    oriģinālā saite blogā", column G of the workbook), so the site links
--    them directly for now. Availability therefore depends on the blog's
--    image host. Moving the files into project storage later only needs a
--    new nullable column for the stored path; nothing here blocks it.
--
-- 2. The public can read only the columns it needs. Row Level Security
--    cannot hide columns, so anon/authenticated get a column-level SELECT
--    grant instead of a table-level one. drive_reference_url,
--    drive_filename, external_image_id and source_row_number are internal
--    import/administration references and are not granted. A request for
--    `select=*` from the public API is refused; the application always
--    names its columns.
--
-- 3. An image is publicly readable when its object is published and its
--    rights_status is not 'not_cleared'. The initial status,
--    'attribution_required_pending_review', IS readable: the owner
--    confirmed reuse with source attribution (docs/DAY5_COLUMN_MAPPING.md),
--    and source_attribution_note is NOT NULL so an image cannot exist
--    without the attribution the site must print.
--
-- 4. Visitor access and accessibility are nullable enums on
--    heritage_objects, with NULL meaning "not recorded". The public page
--    must distinguish that from an explicit 'not_accessible'
--    (docs/DATA_MODEL.md: "Keep unknown values null instead of writing
--    'no'"). No index is added for them here; Day 17's filters should add
--    one only if a measured plan needs it.
--
-- 5. Nothing in this migration loads data. Populating object_images from
--    the workbook is import work (staging and promotion), not part of
--    Day 15.

begin;

-- ---------------------------------------------------------------------------
-- 1. Enum types
-- ---------------------------------------------------------------------------

create type image_rights_status as enum (
  'attribution_required_pending_review',
  'cleared',
  'not_cleared'
);

create type public_access_status as enum (
  'open',
  'by_appointment',
  'exterior_only',
  'not_accessible'
);

create type accessibility_status as enum (
  'accessible',
  'partially_accessible',
  'not_accessible'
);

-- ---------------------------------------------------------------------------
-- 2. object_images
-- ---------------------------------------------------------------------------

create table object_images (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references heritage_objects (id) on delete cascade,

  -- Stable per-image handle from the import (normalised Drive file ID,
  -- else original URL, else a deterministic hash) - internal.
  external_image_id text not null,

  -- Publicly displayed image (see decision 1).
  source_image_url text not null,

  -- Internal/administration references - never granted to the public.
  drive_reference_url text,
  drive_filename text,
  source_row_number integer,

  -- Public descriptive fields. All optional: the source has a caption for
  -- about 0.1% of images and no alt text, credit or licence at all.
  caption_lv text,
  alt_text_lv text,
  credit text,
  license_name text,
  license_url text,

  -- Required: the attribution the site must print with the image.
  source_attribution_note text not null,
  rights_status image_rights_status not null default 'attribution_required_pending_review',

  is_primary boolean not null default false,
  sort_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint object_images_external_unique unique (object_id, external_image_id),
  constraint object_images_source_url_https check (source_image_url ~ '^https://'),
  constraint object_images_license_url_http check (
    license_url is null or license_url ~ '^https?://'
  ),
  constraint object_images_attribution_not_blank check (
    length(btrim(source_attribution_note)) > 0
  )
);

comment on table object_images is
  'One row per image of a heritage object. source_image_url is what the public site displays (see the migration header, decision 1); the drive_* columns and external_image_id are internal references and are not readable by anon/authenticated.';

-- At most one cover image per object.
create unique index object_images_one_primary_idx
  on object_images (object_id)
  where is_primary;

-- Serves both "all images of an object, in order" and the foreign-key
-- lookups the cascade relies on.
create index object_images_object_order_idx
  on object_images (object_id, sort_order, id);

create trigger object_images_set_updated_at
  before update on object_images
  for each row
  execute function set_updated_at();

alter table object_images enable row level security;

-- Column-level read access (decision 2). No table-level SELECT is granted.
grant select (
  id,
  object_id,
  source_image_url,
  caption_lv,
  alt_text_lv,
  credit,
  license_name,
  license_url,
  source_attribution_note,
  rights_status,
  is_primary,
  sort_order
) on object_images to anon, authenticated;

revoke insert, update, delete, truncate, references, trigger
  on object_images
  from anon, authenticated;

create policy object_images_select_for_published_objects
  on object_images
  for select
  to anon, authenticated
  using (
    rights_status <> 'not_cleared'
    and exists (
      select 1
      from heritage_objects ho
      where ho.id = object_images.object_id
        and ho.status = 'published'
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Visitor access and accessibility on heritage_objects (decision 4)
-- ---------------------------------------------------------------------------

alter table heritage_objects
  add column public_access public_access_status,
  add column public_access_notes_lv text,
  add column accessibility accessibility_status,
  add column accessibility_notes_lv text,
  add column access_verified_at date;

comment on column heritage_objects.public_access is
  'Whether visitors can enter. NULL means not recorded - never the same thing as not_accessible.';
comment on column heritage_objects.accessibility is
  'Physical accessibility for visitors with reduced mobility. NULL means not recorded - never the same thing as not_accessible.';
comment on column heritage_objects.access_verified_at is
  'Date the access and accessibility information was last checked. Never defaulted: an unchecked record stays NULL.';

commit;
