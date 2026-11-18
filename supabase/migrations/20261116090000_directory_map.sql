-- Day 19: the interactive map's viewport query, sharing the directory's
-- search-and-filter rules.
--
-- Builds on: 20261012195606_initial_heritage_schema.sql (latitude, longitude, location)
--            20261019175413_indexes_roles_rls.sql       (RLS, GiST on location)
--            20261113120000_directory_search.sql       (search_document, fold_search_text)
--            20261114090000_directory_filters.sql      (Day 17 filters)
--            20261115090000_directory_classification_filters.sql (Day 18 filters)
-- Notes:     docs/DAY19_MAP_NOTES.md
--
-- NOT APPLIED ANYWHERE by the session that wrote it; exercised only on a
-- disposable local PostgreSQL 16 + PostGIS 3.4 database. Apply it after the
-- Day 15-18 migrations. It adds functions and one index; it changes no
-- table, no data and no public function signature. The Day 16-18 search
-- function keeps its signature and behaviour (its body now calls the shared
-- pieces below), so Day 18 application code keeps working once this is
-- applied, and Day 19 code needs it for /map.
--
-- Decisions made while writing this migration (flagged for Codex review):
--
-- 1. One set of matching rules for the list and the map. The Day 16-18
--    parsing of search terms and filters moves into
--    private.parse_directory_filters(), and the matching predicates into
--    private.published_objects_matching(), an inlinable SQL set-returning
--    function. The list helper (private.search_published_object_keys) and
--    the map helpers both select from it, so the two views cannot disagree
--    about which objects match. Because it is inlined into each caller,
--    the planner still sees one query and uses the same indexes as before
--    (checked with EXPLAIN and re-timed - see the notes).
--
-- 2. Valid map coordinates. The schema already makes latitude/longitude
--    NOT NULL and range-checked, and location is generated from them, so a
--    published object cannot lack coordinates. docs/DATA_MODEL.md says "Do
--    not publish coordinates outside Latvia": the map shows only points
--    inside a fixed Latvia bounding box (latitude 55.60-58.15, longitude
--    20.90-28.30 - Latvia's extent plus a small margin; the same constants
--    are in src/lib/map/viewport.ts). Points outside it are treated as
--    invalid map locations: never shown on the map, never repaired, and
--    still listed in the directory. A valid point merely outside the
--    current viewport is a different case: it appears when the visitor
--    pans to it.
--
-- 3. The viewport is an exact longitude/latitude rectangle (what Leaflet
--    shows), matched with a planar bounding-box test on
--    geometry(location), not a geodesic one on geography. A partial GiST
--    expression index serves it.
--
-- 4. Bounded responses. A viewport returns every matching object as a
--    point when there are at most 500 of them; otherwise it returns grid
--    clusters with exact counts. A truncated point set is never returned.
--
-- 5. Trust boundary. As on Day 16, matching runs in SECURITY DEFINER
--    helpers in the `private` schema (RLS would stop index use for LIKE and
--    enum equality). They hard-code status = 'published'. The point helper
--    returns ids only, which the public SECURITY INVOKER function re-reads
--    under RLS. The cluster helper returns only aggregates of published
--    rows: a grid cell's centre, extent and object count, and, for a cell
--    with exactly one object, its id (also re-read under RLS).

begin;

-- ---------------------------------------------------------------------------
-- 1. Spatial index (decision 3)
-- ---------------------------------------------------------------------------

create index heritage_objects_published_location_geometry_idx
  on heritage_objects using gist ((extensions.geometry(location)))
  where status = 'published';

-- ---------------------------------------------------------------------------
-- 2. Shared parsing of search terms and filters (decision 1)
-- ---------------------------------------------------------------------------

create type private.directory_filter_set as (
  p1 text,
  p2 text,
  p3 text,
  p4 text,
  p5 text,
  object_types public.object_type[],
  municipalities text[],
  access public.public_access_status[],
  require_accommodation boolean,
  require_catering boolean,
  require_event_facilities boolean,
  condition_types public.condition_category[],
  condition_unknown boolean,
  ownership_types public.ownership_type[],
  ownership_unknown boolean,
  family_names text[],
  family_unknown boolean,
  -- true when there is neither a search term nor any filter
  is_empty boolean
);

-- Exactly the Day 16-18 rules: five folded, LIKE-escaped search terms;
-- known enum values only; ownership groups expanded; canonical family
-- names; at most 50 values per array; a category given only unusable
-- values matches nothing ('{}'), never "all".
create function private.parse_directory_filters(
  search_query text,
  object_types text[],
  municipalities text[],
  access_types text[],
  accommodation boolean,
  catering boolean,
  event_facilities boolean,
  condition_categories text[],
  ownership_groups text[],
  historical_families text[],
  family_unknown boolean
) returns private.directory_filter_set
  language plpgsql
  stable
  security invoker
  set search_path = public, extensions
as $$
declare
  terms text[];
  f private.directory_filter_set;
begin
  select array_agg('%' || replace(replace(replace(t.term, '\', '\\'), '%', '\%'), '_', '\_') || '%'
                   order by t.ord)
    into terms
    from (
      select s.term, s.ord
      from regexp_split_to_table(
             btrim(fold_search_text(left(coalesce(search_query, ''), 200))), '\s+'
           ) with ordinality as s(term, ord)
      where s.term <> ''
      order by s.ord
      limit 5
    ) t;

  f.p1 := coalesce(terms[1], '%');
  f.p2 := coalesce(terms[2], '%');
  f.p3 := coalesce(terms[3], '%');
  f.p4 := coalesce(terms[4], '%');
  f.p5 := coalesce(terms[5], '%');

  select array_agg(distinct v.value::object_type)
    into f.object_types
    from (select unnest(object_types[1:50]) as value) v
    where v.value = any (enum_range(null::object_type)::text[]);

  select array_agg(distinct v.value::public_access_status)
    into f.access
    from (select unnest(access_types[1:50]) as value) v
    where v.value = any (enum_range(null::public_access_status)::text[]);

  select array_agg(distinct btrim(v.value))
    into f.municipalities
    from (select unnest(municipalities[1:50]) as value) v
    where btrim(v.value) <> '' and length(v.value) <= 120;

  f.require_accommodation := accommodation is true;
  f.require_catering := catering is true;
  f.require_event_facilities := event_facilities is true;

  select array_agg(distinct v.value::condition_category)
    into f.condition_types
    from (select unnest(condition_categories[1:50]) as value) v
    where v.value = any (enum_range(null::condition_category)::text[]);
  f.condition_unknown := coalesce('unknown' = any (condition_categories[1:50]), false);

  select array_agg(distinct o.value)
    into f.ownership_types
    from (
      select unnest(case g.value
        when 'private' then array['private_person', 'private_legal_entity']::ownership_type[]
        when 'public' then array['municipality', 'state']::ownership_type[]
      end) as value
      from (select unnest(ownership_groups[1:50]) as value) g
    ) o
    where o.value is not null;
  f.ownership_unknown := coalesce('unknown' = any (ownership_groups[1:50]), false);

  select array_agg(distinct canonical_family_name(v.value))
    into f.family_names
    from (select unnest(historical_families[1:50]) as value) v
    where canonical_family_name(v.value) is not null
      and length(canonical_family_name(v.value)) <= 120;
  f.family_unknown := family_unknown is true;

  if object_types is not null and cardinality(object_types) > 0 and f.object_types is null then
    f.object_types := '{}';
  end if;
  if access_types is not null and cardinality(access_types) > 0 and f.access is null then
    f.access := '{}';
  end if;
  if municipalities is not null and cardinality(municipalities) > 0 and f.municipalities is null then
    f.municipalities := '{}';
  end if;
  if condition_categories is not null and cardinality(condition_categories) > 0
     and f.condition_types is null and not f.condition_unknown then
    f.condition_types := '{}';
  end if;
  if ownership_groups is not null and cardinality(ownership_groups) > 0
     and f.ownership_types is null and not f.ownership_unknown then
    f.ownership_types := '{}';
  end if;
  if historical_families is not null and cardinality(historical_families) > 0
     and f.family_names is null and not f.family_unknown then
    f.family_names := '{}';
  end if;

  f.is_empty := terms is null
    and f.object_types is null
    and f.municipalities is null
    and f.access is null
    and not f.require_accommodation
    and not f.require_catering
    and not f.require_event_facilities
    and f.condition_types is null and not f.condition_unknown
    and f.ownership_types is null and not f.ownership_unknown
    and f.family_names is null and not f.family_unknown;

  return f;
end;
$$;

comment on function private.parse_directory_filters(text, text[], text[], text[], boolean, boolean, boolean, text[], text[], text[], boolean) is
  'Internal. The one parser of directory search terms and filters (Days 16-19), shared by the list and the map: validates, bounds and canonicalises raw arguments. Reads no table.';

revoke all on function private.parse_directory_filters(text, text[], text[], text[], boolean, boolean, boolean, text[], text[], text[], boolean) from public;
grant execute on function private.parse_directory_filters(text, text[], text[], text[], boolean, boolean, boolean, text[], text[], text[], boolean)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Shared matching (decision 1)
-- ---------------------------------------------------------------------------

-- Ids of published objects with a verified link to any of the given
-- (canonical) family names: a set, so an object linked to several selected
-- families appears once.
create function private.published_family_object_ids(family_names text[])
  returns uuid[]
  language sql
  stable
  set search_path = ''
as $$
  select coalesce(array_agg(distinct f.object_id), '{}')
  from public.object_historical_owner_families f
  join public.heritage_objects fo
    on fo.id = f.object_id
   and fo.status = 'published'
  where f.verification_status = 'verified'
    and public.canonical_family_name(f.family_name) = any (family_names);
$$;

revoke all on function private.published_family_object_ids(text[]) from public;

-- Every published object matching the search patterns and filters, as
-- whole rows. Written to be inlined into its callers (a single-SELECT SQL
-- function, not SECURITY DEFINER and without a SET clause - a SET clause
-- would stop inlining, so every reference is schema-qualified instead).
-- Callers add their own ordering, keyset or viewport, and limit.
create function private.published_objects_matching(
  p1 text,
  p2 text,
  p3 text,
  p4 text,
  p5 text,
  object_types public.object_type[],
  municipalities text[],
  access public.public_access_status[],
  require_accommodation boolean,
  require_catering boolean,
  require_event_facilities boolean,
  condition_types public.condition_category[],
  condition_unknown boolean,
  ownership_types public.ownership_type[],
  ownership_unknown boolean,
  family_filtered boolean,
  family_ids uuid[],
  family_unknown boolean
) returns setof public.heritage_objects
  language sql
  stable
as $$
  select ho.*
  from public.heritage_objects ho
  where ho.status = 'published'
    -- An unused term slot is '%'; skipping it (folded away per call)
    -- spares reading search_document for every row of an unsearched map.
    and (p1 = '%' or ho.search_document like p1)
    and (p2 = '%' or ho.search_document like p2)
    and (p3 = '%' or ho.search_document like p3)
    and (p4 = '%' or ho.search_document like p4)
    and (p5 = '%' or ho.search_document like p5)
    and (object_types is null or ho.object_type = any (object_types))
    and (municipalities is null or ho.municipality = any (municipalities))
    and (access is null or ho.public_access = any (access))
    and (require_accommodation is not true or ho.offers_accommodation is true)
    and (require_catering is not true or ho.offers_catering is true)
    and (require_event_facilities is not true or ho.offers_event_facilities is true)
    and (
      (condition_types is null and condition_unknown is not true)
      or ho.condition_category = any (condition_types)
      or (condition_unknown is true and ho.condition_category is null)
    )
    and (
      (ownership_types is null and ownership_unknown is not true)
      or ho.ownership_type = any (ownership_types)
      or (ownership_unknown is true and ho.ownership_type is null)
    )
    and (
      family_filtered is not true
      or ho.id = any (family_ids)
      or (
        family_unknown is true
        and not exists (
          select 1
          from public.object_historical_owner_families nf
          where nf.object_id = ho.id
            and nf.verification_status = 'verified'
            and public.canonical_family_name(nf.family_name) is not null
        )
      )
    );
$$;

comment on function private.published_objects_matching(text, text, text, text, text, public.object_type[], text[], public.public_access_status[], boolean, boolean, boolean, public.condition_category[], boolean, public.ownership_type[], boolean, boolean, uuid[], boolean) is
  'Internal. The one set of directory matching rules (Days 16-19), shared by the list and the map helpers and inlined into them. Not granted to any API role: only the SECURITY DEFINER helpers call it.';

revoke all on function private.published_objects_matching(text, text, text, text, text, public.object_type[], text[], public.public_access_status[], boolean, boolean, boolean, public.condition_category[], boolean, public.ownership_type[], boolean, boolean, uuid[], boolean)
  from public;

-- The list helper, same signature and behaviour as Day 18, now built on the
-- shared matcher.
create or replace function private.search_published_object_keys(
  p1 text,
  p2 text,
  p3 text,
  p4 text,
  p5 text,
  object_types public.object_type[],
  municipalities text[],
  access public.public_access_status[],
  require_accommodation boolean,
  require_catering boolean,
  require_event_facilities boolean,
  condition_types public.condition_category[],
  condition_unknown boolean,
  ownership_types public.ownership_type[],
  ownership_unknown boolean,
  family_names text[],
  family_unknown boolean,
  after_name text,
  after_id uuid,
  row_limit integer
) returns table (object_id uuid)
  language plpgsql
  stable
  rows 50
  security definer
  set search_path = ''
  set plan_cache_mode = force_custom_plan
as $$
declare
  family_ids uuid[];
begin
  if family_names is not null then
    family_ids := private.published_family_object_ids(family_names);
  end if;

  return query
    select m.id
    from private.published_objects_matching(
           p1, p2, p3, p4, p5,
           object_types, municipalities, access,
           require_accommodation, require_catering, require_event_facilities,
           condition_types, condition_unknown,
           ownership_types, ownership_unknown,
           family_names is not null or family_unknown is true, family_ids, family_unknown
         ) m
    where after_name is null
       or after_id is null
       or (m.name_lv, m.id) > (after_name, after_id)
    order by m.name_lv, m.id
    limit least(greatest(coalesce(row_limit, 25), 1), 50);
end;
$$;

-- The public list function, same signature and behaviour as Day 18, now
-- built on the shared parser.
create or replace function search_public_heritage_objects(
  search_query text default null,
  object_types text[] default null,
  municipalities text[] default null,
  access_types text[] default null,
  accommodation boolean default false,
  catering boolean default false,
  event_facilities boolean default false,
  condition_categories text[] default null,
  ownership_groups text[] default null,
  historical_families text[] default null,
  family_unknown boolean default false,
  after_name text default null,
  after_id uuid default null,
  page_size integer default 25
) returns table (
  id uuid,
  slug text,
  name_lv text,
  object_type object_type,
  municipality text,
  condition_category condition_category,
  ownership_type ownership_type,
  public_access public_access_status,
  cover_image_url text,
  cover_image_alt_lv text
)
  language plpgsql
  stable
  rows 50
  security invoker
  set search_path = public, extensions
as $$
declare
  f private.directory_filter_set;
begin
  f := private.parse_directory_filters(
         search_query, object_types, municipalities, access_types,
         accommodation, catering, event_facilities,
         condition_categories, ownership_groups, historical_families, family_unknown);

  -- With no search term and no filter it returns no rows: the unfiltered
  -- directory has its own path.
  if f.is_empty then
    return;
  end if;

  return query
    select
      ho.id,
      ho.slug,
      ho.name_lv,
      ho.object_type,
      ho.municipality,
      ho.condition_category,
      ho.ownership_type,
      ho.public_access,
      cover.source_image_url,
      cover.alt_text_lv
    from private.search_published_object_keys(
           f.p1, f.p2, f.p3, f.p4, f.p5,
           f.object_types, f.municipalities, f.access,
           f.require_accommodation, f.require_catering, f.require_event_facilities,
           f.condition_types, f.condition_unknown,
           f.ownership_types, f.ownership_unknown,
           f.family_names, f.family_unknown,
           after_name, after_id, page_size
         ) with ordinality as k(object_id, ord)
    join heritage_objects ho
      on ho.id = k.object_id
     and ho.status = 'published'
    left join object_images cover
      on cover.object_id = ho.id
     and cover.is_primary
     and cover.rights_status <> 'not_cleared'
    order by k.ord;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Map helpers (decisions 2-5)
-- ---------------------------------------------------------------------------

-- Ids of matching published objects inside the rectangle, at most
-- row_limit (1..501) of them, in no particular order: the caller only needs
-- to know whether there are more than 500, and orders a set of at most 500
-- itself (ordering every match first cost ~10 ms at 10,000 objects). The
-- caller clamps the rectangle to the Latvia box first.
create function private.map_published_object_keys(
  p1 text,
  p2 text,
  p3 text,
  p4 text,
  p5 text,
  object_types public.object_type[],
  municipalities text[],
  access public.public_access_status[],
  require_accommodation boolean,
  require_catering boolean,
  require_event_facilities boolean,
  condition_types public.condition_category[],
  condition_unknown boolean,
  ownership_types public.ownership_type[],
  ownership_unknown boolean,
  family_names text[],
  family_unknown boolean,
  west double precision,
  south double precision,
  east double precision,
  north double precision,
  use_spatial_index boolean,
  row_limit integer
) returns table (object_id uuid)
  language plpgsql
  stable
  rows 500
  security definer
  set search_path = ''
  set plan_cache_mode = force_custom_plan
as $$
declare
  family_ids uuid[];
begin
  if family_names is not null then
    family_ids := private.published_family_object_ids(family_names);
  end if;

  return query
    select m.id
    from private.published_objects_matching(
           p1, p2, p3, p4, p5,
           object_types, municipalities, access,
           require_accommodation, require_catering, require_event_facilities,
           condition_types, condition_unknown,
           ownership_types, ownership_unknown,
           family_names is not null or family_unknown is true, family_ids, family_unknown
         ) m
    -- One of the two rectangle tests is folded away per call (custom
    -- plan): the GiST index for a small viewport, a plain range test (and
    -- so a sequential scan) for a large one - see public_map_objects.
    where (
      use_spatial_index is true
      and extensions.geometry(m.location)
          operator(extensions.&&) extensions.st_makeenvelope(west, south, east, north, 4326)
    ) or (
      use_spatial_index is not true
      and m.longitude between west::numeric and east::numeric
      and m.latitude between south::numeric and north::numeric
    )
    limit least(greatest(coalesce(row_limit, 501), 1), 501);
end;
$$;

comment on function private.map_published_object_keys(text, text, text, text, text, public.object_type[], text[], public.public_access_status[], boolean, boolean, boolean, public.condition_category[], boolean, public.ownership_type[], boolean, text[], boolean, double precision, double precision, double precision, double precision, boolean, integer) is
  'SECURITY DEFINER, internal. Ids only of published heritage objects matching the directory rules inside a longitude/latitude rectangle, unordered, at most 501. Never returns row data.';

revoke all on function private.map_published_object_keys(text, text, text, text, text, public.object_type[], text[], public.public_access_status[], boolean, boolean, boolean, public.condition_category[], boolean, public.ownership_type[], boolean, text[], boolean, double precision, double precision, double precision, double precision, boolean, integer)
  from public;
grant execute on function private.map_published_object_keys(text, text, text, text, text, public.object_type[], text[], public.public_access_status[], boolean, boolean, boolean, public.condition_category[], boolean, public.ownership_type[], boolean, text[], boolean, double precision, double precision, double precision, double precision, boolean, integer)
  to anon, authenticated, service_role;

-- Grid clusters of matching published objects inside the rectangle: one
-- row per non-empty cell of cell_size degrees (anchored at west/south),
-- with the members' mean position, extent and exact count, and - only for
-- a single-object cell - that object's id. Aggregates of published rows
-- only (decision 5).
create function private.map_published_clusters(
  p1 text,
  p2 text,
  p3 text,
  p4 text,
  p5 text,
  object_types public.object_type[],
  municipalities text[],
  access public.public_access_status[],
  require_accommodation boolean,
  require_catering boolean,
  require_event_facilities boolean,
  condition_types public.condition_category[],
  condition_unknown boolean,
  ownership_types public.ownership_type[],
  ownership_unknown boolean,
  family_names text[],
  family_unknown boolean,
  west double precision,
  south double precision,
  east double precision,
  north double precision,
  use_spatial_index boolean,
  cell_size double precision
) returns table (
  latitude double precision,
  longitude double precision,
  object_count bigint,
  min_latitude double precision,
  min_longitude double precision,
  max_latitude double precision,
  max_longitude double precision,
  single_object_id uuid
)
  language plpgsql
  stable
  rows 200
  security definer
  set search_path = ''
  set plan_cache_mode = force_custom_plan
as $$
declare
  family_ids uuid[];
begin
  if family_names is not null then
    family_ids := private.published_family_object_ids(family_names);
  end if;

  return query
    select
      -- double precision, not numeric, arithmetic: ~2x faster over 10,000 rows
      avg(m.latitude::double precision),
      avg(m.longitude::double precision),
      count(*),
      min(m.latitude::double precision),
      min(m.longitude::double precision),
      max(m.latitude::double precision),
      max(m.longitude::double precision),
      case when count(*) = 1 then (array_agg(m.id))[1] end
    from private.published_objects_matching(
           p1, p2, p3, p4, p5,
           object_types, municipalities, access,
           require_accommodation, require_catering, require_event_facilities,
           condition_types, condition_unknown,
           ownership_types, ownership_unknown,
           family_names is not null or family_unknown is true, family_ids, family_unknown
         ) m
    -- One of the two rectangle tests is folded away per call (custom
    -- plan): the GiST index for a small viewport, a plain range test (and
    -- so a sequential scan) for a large one - see public_map_objects.
    where (
      use_spatial_index is true
      and extensions.geometry(m.location)
          operator(extensions.&&) extensions.st_makeenvelope(west, south, east, north, 4326)
    ) or (
      use_spatial_index is not true
      and m.longitude between west::numeric and east::numeric
      and m.latitude between south::numeric and north::numeric
    )
    group by floor((m.longitude::double precision - west) / cell_size),
             floor((m.latitude::double precision - south) / cell_size)
    order by 3 desc, 1, 2;
end;
$$;

comment on function private.map_published_clusters(text, text, text, text, text, public.object_type[], text[], public.public_access_status[], boolean, boolean, boolean, public.condition_category[], boolean, public.ownership_type[], boolean, text[], boolean, double precision, double precision, double precision, double precision, boolean, double precision) is
  'SECURITY DEFINER, internal. Grid clusters (mean position, extent, exact count) of published heritage objects matching the directory rules inside a rectangle; a single-object cell also carries that object''s id. Aggregates of published rows only.';

revoke all on function private.map_published_clusters(text, text, text, text, text, public.object_type[], text[], public.public_access_status[], boolean, boolean, boolean, public.condition_category[], boolean, public.ownership_type[], boolean, text[], boolean, double precision, double precision, double precision, double precision, boolean, double precision)
  from public;
grant execute on function private.map_published_clusters(text, text, text, text, text, public.object_type[], text[], public.public_access_status[], boolean, boolean, boolean, public.condition_category[], boolean, public.ownership_type[], boolean, text[], boolean, double precision, double precision, double precision, double precision, boolean, double precision)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. The public map function (decisions 2-5)
-- ---------------------------------------------------------------------------

-- Everything the map needs for one viewport, with the directory's search
-- and filter arguments and rules:
--
-- - The rectangle (west, south, east, north in degrees) is validated and
--   clamped to the Latvia box; an invalid or empty one returns no rows.
-- - At most 500 matching objects: one 'object' row each (id, slug, name,
--   type, position), read under the caller's RLS, in directory order.
-- - More than 500: 'cluster' rows - grid cells of at least ~64 screen
--   pixels at `zoom` and at most 32 x 32 over the rectangle - with exact
--   counts and extents; a cell holding one object becomes an 'object' row.
--   The sum of object_count is always the exact number of matches.
-- - Unlike the list function, no search and no filter means "everything
--   in the viewport".
create function public_map_objects(
  west double precision,
  south double precision,
  east double precision,
  north double precision,
  zoom integer default 7,
  search_query text default null,
  object_types text[] default null,
  municipalities text[] default null,
  access_types text[] default null,
  accommodation boolean default false,
  catering boolean default false,
  event_facilities boolean default false,
  condition_categories text[] default null,
  ownership_groups text[] default null,
  historical_families text[] default null,
  family_unknown boolean default false
) returns table (
  kind text,
  id uuid,
  slug text,
  name_lv text,
  object_type object_type,
  latitude double precision,
  longitude double precision,
  object_count bigint,
  min_latitude double precision,
  min_longitude double precision,
  max_latitude double precision,
  max_longitude double precision
)
  language plpgsql
  stable
  rows 500
  security invoker
  set search_path = public, extensions
as $$
declare
  -- Latvia box (decision 2); keep in step with src/lib/map/viewport.ts.
  latvia_south constant double precision := 55.60;
  latvia_west constant double precision := 20.90;
  latvia_north constant double precision := 58.15;
  latvia_east constant double precision := 28.30;
  max_objects constant integer := 500;
  f private.directory_filter_set;
  w double precision;
  s double precision;
  e double precision;
  n double precision;
  z integer;
  ids uuid[];
  cell double precision;
  use_index boolean;
  c record;
begin
  if west is null or south is null or east is null or north is null
     or west = 'NaN' or south = 'NaN' or east = 'NaN' or north = 'NaN'
     or west >= east or south >= north
     or south < -90 or north > 90 or west < -180 or east > 180 then
    return;
  end if;

  w := greatest(west, latvia_west);
  s := greatest(south, latvia_south);
  e := least(east, latvia_east);
  n := least(north, latvia_north);
  if w >= e or s >= n then
    return;
  end if;
  z := least(greatest(coalesce(zoom, 7), 0), 20);

  -- PostGIS cannot estimate the expression index's selectivity (it
  -- assumes one row), so for a viewport covering much of Latvia the
  -- planner would walk the index over thousands of rows. Measured at
  -- 10,643 objects: the index wins for small viewports, a sequential scan
  -- for anything over about a quarter of the Latvia box.
  use_index := (e - w) * (n - s)
               < 0.25 * (latvia_east - latvia_west) * (latvia_north - latvia_south);

  f := private.parse_directory_filters(
         search_query, object_types, municipalities, access_types,
         accommodation, catering, event_facilities,
         condition_categories, ownership_groups, historical_families, family_unknown);

  select array_agg(k.object_id)
    into ids
    from private.map_published_object_keys(
           f.p1, f.p2, f.p3, f.p4, f.p5,
           f.object_types, f.municipalities, f.access,
           f.require_accommodation, f.require_catering, f.require_event_facilities,
           f.condition_types, f.condition_unknown,
           f.ownership_types, f.ownership_unknown,
           f.family_names, f.family_unknown,
           w, s, e, n, use_index, max_objects + 1
         ) k;

  if ids is null then
    return;
  end if;

  if cardinality(ids) <= max_objects then
    return query
      select 'object'::text, ho.id, ho.slug, ho.name_lv, ho.object_type,
             ho.latitude::double precision, ho.longitude::double precision, 1::bigint,
             ho.latitude::double precision, ho.longitude::double precision,
             ho.latitude::double precision, ho.longitude::double precision
      from unnest(ids) as k(object_id)
      join heritage_objects ho
        on ho.id = k.object_id
       and ho.status = 'published'
      order by ho.name_lv, ho.id;
    return;
  end if;

  -- ~64 px at this zoom (256 px tiles span 360 / 2^z degrees of longitude),
  -- and never finer than 1/32 of the rectangle's larger side.
  cell := greatest(360.0 / (2 ^ z) / 256.0 * 64.0, greatest(e - w, n - s) / 32.0);

  -- Single-object cells are re-read one by one under the caller's RLS (an
  -- index lookup each); cluster cells carry only their aggregates.
  for c in
    select *
    from private.map_published_clusters(
           f.p1, f.p2, f.p3, f.p4, f.p5,
           f.object_types, f.municipalities, f.access,
           f.require_accommodation, f.require_catering, f.require_event_facilities,
           f.condition_types, f.condition_unknown,
           f.ownership_types, f.ownership_unknown,
           f.family_names, f.family_unknown,
           w, s, e, n, use_index, cell
         )
  loop
    kind := 'cluster';
    id := null;
    slug := null;
    name_lv := null;
    object_type := null;
    if c.single_object_id is not null then
      select 'object', h.id, h.slug, h.name_lv, h.object_type
        into kind, id, slug, name_lv, object_type
        from heritage_objects h
        where h.id = c.single_object_id
          and h.status = 'published';
      if not found then
        continue;
      end if;
    end if;
    latitude := c.latitude;
    longitude := c.longitude;
    object_count := c.object_count;
    min_latitude := c.min_latitude;
    min_longitude := c.min_longitude;
    max_latitude := c.max_latitude;
    max_longitude := c.max_longitude;
    return next;
  end loop;
end;
$$;

comment on function public_map_objects(double precision, double precision, double precision, double precision, integer, text, text[], text[], text[], boolean, boolean, boolean, text[], text[], text[], boolean) is
  'Public map viewport query (Day 19): matching published heritage objects inside a Latvia-clamped rectangle, with the directory''s search and filter rules - every object as a point when there are at most 500, otherwise grid clusters with exact counts. SECURITY INVOKER; object rows are read under the caller''s RLS.';

revoke all on function public_map_objects(double precision, double precision, double precision, double precision, integer, text, text[], text[], text[], boolean, boolean, boolean, text[], text[], text[], boolean) from public;
grant execute on function public_map_objects(double precision, double precision, double precision, double precision, integer, text, text[], text[], text[], boolean, boolean, boolean, text[], text[], text[], boolean)
  to anon, authenticated, service_role;

commit;
