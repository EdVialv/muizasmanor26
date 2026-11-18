-- Day 17: directory filters (object type, region, public access,
-- accommodation, catering, event facilities).
--
-- Builds on: 20261012195606_initial_heritage_schema.sql (object_type, municipality)
--            20261019175413_indexes_roles_rls.sql       (RLS, B-tree indexes)
--            20261113090000_object_images_access.sql   (public_access)
--            20261113120000_directory_search.sql       (search_document, search functions)
-- Notes:     docs/DAY17_DIRECTORY_FILTERS_NOTES.md
--
-- NOT APPLIED ANYWHERE by the session that wrote it; exercised only on a
-- disposable local PostgreSQL 16 + PostGIS database. Apply it after the
-- Day 15 and Day 16 migrations and before deploying the Day 17 code. It
-- replaces the Day 16 search function with one that also takes filters, so
-- Day 16 application code calling the old signature stops working once this
-- is applied: deploy the two together.
--
-- Decisions made while writing this migration (flagged for Codex review):
--
-- 1. Services are three nullable booleans, not one enum or a join table.
--    docs/DATA_MODEL.md lists "Event availability", "Accommodation and
--    catering availability" as recommended fields without a shape, and
--    requires "Keep unknown values null instead of writing 'no'". A nullable
--    boolean says exactly that: true = recorded as offered, false = recorded
--    as not offered, NULL = not recorded. A positive filter matches true
--    only. services_verified_at mirrors Day 15's access_verified_at.
--    Nothing is backfilled: no source records these services, and they must
--    not be inferred from descriptions.
--
--    "Event facilities" means the place offers event services or a venue
--    (weddings, conferences, celebrations) - not a calendar of dated events.
--
-- 2. Region is the stored municipality, matched exactly. It is the only
--    geographic classification in the schema, with no code or controlled
--    list behind it, so variants ("Bauskas novads" and "Bauskas novads
--    (Rundāles pagasts)") are separate options until the open Day 11
--    municipality mapping normalises them. Grouping municipalities into
--    planning regions would need that normalised list first.
--
-- 3. Filters never inherit from a parent object: docs/DATA_MODEL.md defines
--    no inheritance, so each object is filtered on its own recorded values.
--
-- 4. Every filtered listing - with or without a search query - goes through
--    the search function, so search and filters are one query and one
--    keyset order. As on Day 16, matching happens in an ids-only SECURITY
--    DEFINER helper: under RLS, PostgreSQL will not use an index for a
--    non-leakproof operator before the policy condition is applied, and
--    LIKE and enum equality (enum_eq) are both not leakproof.
--
-- 5. Filter arrays arrive as text and are reduced to known values inside
--    the function; an unknown value is ignored rather than raising, so a
--    stale or hand-edited URL cannot turn into a 400.
--
-- 6. Three small partial indexes, one per service flag, on (name_lv, id)
--    for published rows recorded as offering the service. Measured locally
--    as anon on ~10,600-10,800 published rows (docs/DAY17_DIRECTORY_FILTERS_NOTES.md):
--    while service data is sparse - the realistic early state; there ~175
--    accommodation, ~90 event-facility rows - the planner otherwise answers
--    a service filter with a sequential scan of every published row
--    ("Rows Removed by Filter: 10746"), a median of 1.1-2.1 ms per page and
--    growing linearly. With this migration freshly applied, the same pages
--    take a median of 0.20-0.44 ms and read only matching rows in order.
--    Each index holds only the flagged rows (16-40 kB). Their predicates say `IS TRUE`, exactly
--    as the matching function does - with a plain `offers_x` predicate the
--    planner cannot prove the function's condition implies it and ignores
--    the index (also measured). Type and region use the Day 9 B-tree
--    indexes; access uses the Day 16 partial (name_lv, id) index. No other
--    index is added.

begin;

-- ---------------------------------------------------------------------------
-- 1. Recorded services (decision 1)
-- ---------------------------------------------------------------------------

alter table heritage_objects
  add column offers_accommodation boolean,
  add column offers_catering boolean,
  add column offers_event_facilities boolean,
  add column services_verified_at date;

comment on column heritage_objects.offers_accommodation is
  'Recorded as offering overnight accommodation (true), recorded as not offering it (false), or not recorded (NULL - never the same as false). Never inferred from descriptions.';
comment on column heritage_objects.offers_catering is
  'Recorded as offering food service (true/false), or not recorded (NULL).';
comment on column heritage_objects.offers_event_facilities is
  'Recorded as offering event services or a venue - weddings, conferences, celebrations - (true/false), or not recorded (NULL). Not a calendar of dated events.';
comment on column heritage_objects.services_verified_at is
  'Date the service information was last checked. Never defaulted: an unchecked record stays NULL.';

-- Service filters (decision 6). Predicates match the function's `IS TRUE`.
create index heritage_objects_published_accommodation_idx
  on heritage_objects (name_lv, id)
  where status = 'published' and offers_accommodation is true;
create index heritage_objects_published_catering_idx
  on heritage_objects (name_lv, id)
  where status = 'published' and offers_catering is true;
create index heritage_objects_published_event_facilities_idx
  on heritage_objects (name_lv, id)
  where status = 'published' and offers_event_facilities is true;

-- ---------------------------------------------------------------------------
-- 2. Region options: municipalities that have published objects
-- ---------------------------------------------------------------------------

-- SECURITY INVOKER: counts only what the caller's RLS lets them see.
create function public_directory_municipalities()
  returns table (municipality text, object_count bigint)
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  select ho.municipality, count(*)
  from public.heritage_objects ho
  where ho.status = 'published'
    and btrim(ho.municipality) <> ''
  group by ho.municipality
  order by ho.municipality;
$$;

comment on function public_directory_municipalities() is
  'Region filter options: each distinct stored municipality of published objects, with its count. SECURITY INVOKER - read under the caller''s RLS.';

revoke all on function public_directory_municipalities() from public;
grant execute on function public_directory_municipalities() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Matching with filters (replaces the Day 16 helper; decision 4)
-- ---------------------------------------------------------------------------

drop function search_public_heritage_objects(text, text, uuid, integer);
drop function private.search_published_object_keys(text, text, text, text, text, text, uuid, integer);

-- p1..p5: ready-made LIKE patterns ('%' for an unused slot), escaped by the
-- caller. Array filters: NULL = no filter; otherwise the value must be one
-- of them (OR within a category). Service flags: true = must be recorded
-- as offered; false/NULL = no filter. All conditions are ANDed.
create function private.search_published_object_keys(
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
begin
  return query
    select ho.id
    from public.heritage_objects ho
    where ho.status = 'published'
      and ho.search_document like p1
      and ho.search_document like p2
      and ho.search_document like p3
      and ho.search_document like p4
      and ho.search_document like p5
      and (object_types is null or ho.object_type = any (object_types))
      and (municipalities is null or ho.municipality = any (municipalities))
      and (access is null or ho.public_access = any (access))
      and (require_accommodation is not true or ho.offers_accommodation is true)
      and (require_catering is not true or ho.offers_catering is true)
      and (require_event_facilities is not true or ho.offers_event_facilities is true)
      and (
        after_name is null
        or after_id is null
        or (ho.name_lv, ho.id) > (after_name, after_id)
      )
    order by ho.name_lv, ho.id
    limit least(greatest(coalesce(row_limit, 25), 1), 50);
end;
$$;

comment on function private.search_published_object_keys(text, text, text, text, text, public.object_type[], text[], public.public_access_status[], boolean, boolean, boolean, text, uuid, integer) is
  'SECURITY DEFINER, internal. Returns only ids of published heritage objects matching five LIKE patterns and the directory filters, in directory order. Exists so the predicates can use indexes, which Row Level Security prevents for non-leakproof operators. Never returns row data.';

revoke all on function private.search_published_object_keys(text, text, text, text, text, public.object_type[], text[], public.public_access_status[], boolean, boolean, boolean, text, uuid, integer)
  from public;
grant execute on function private.search_published_object_keys(text, text, text, text, text, public.object_type[], text[], public.public_access_status[], boolean, boolean, boolean, text, uuid, integer)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The public search-and-filter function
-- ---------------------------------------------------------------------------

-- One keyset page of published objects matching every term of search_query
-- AND every given filter, in (name_lv, id) order, strictly after
-- (after_name, after_id) when both are given.
--
-- Bounds enforced here, whatever the caller sends: the query is cut to 200
-- characters and its first 5 terms; each filter array to its first 50
-- known, distinct values (municipalities: 120 characters each); page_size
-- to 1..50. With no search term and no filter at all it returns no rows -
-- the unfiltered directory has its own path.
create function search_public_heritage_objects(
  search_query text default null,
  object_types text[] default null,
  municipalities text[] default null,
  access_types text[] default null,
  accommodation boolean default false,
  catering boolean default false,
  event_facilities boolean default false,
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
  terms text[];
  type_filter object_type[];
  municipality_filter text[];
  access_filter public_access_status[];
begin
  -- Fold exactly as the stored document is folded, split on whitespace,
  -- escape LIKE's own wildcards, and wrap each term for substring matching.
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

  -- Keep only known, distinct values (decision 5).
  select array_agg(distinct v.value::object_type)
    into type_filter
    from (select unnest(object_types[1:50]) as value) v
    where v.value = any (enum_range(null::object_type)::text[]);

  select array_agg(distinct v.value::public_access_status)
    into access_filter
    from (select unnest(access_types[1:50]) as value) v
    where v.value = any (enum_range(null::public_access_status)::text[]);

  select array_agg(distinct btrim(v.value))
    into municipality_filter
    from (select unnest(municipalities[1:50]) as value) v
    where btrim(v.value) <> '' and length(v.value) <= 120;

  -- A category the caller asked to filter on, but with no usable value,
  -- matches nothing (an empty array, not NULL) - never silently "all".
  if object_types is not null and cardinality(object_types) > 0 and type_filter is null then
    type_filter := '{}';
  end if;
  if access_types is not null and cardinality(access_types) > 0 and access_filter is null then
    access_filter := '{}';
  end if;
  if municipalities is not null and cardinality(municipalities) > 0 and municipality_filter is null then
    municipality_filter := '{}';
  end if;

  if terms is null
     and type_filter is null
     and municipality_filter is null
     and access_filter is null
     and accommodation is not true
     and catering is not true
     and event_facilities is not true then
    return;
  end if;

  -- The definer function finds and orders the matching published ids; this
  -- statement then reads those rows, and their cover images, as the calling
  -- role - so Row Level Security applies to everything returned.
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
           coalesce(terms[1], '%'),
           coalesce(terms[2], '%'),
           coalesce(terms[3], '%'),
           coalesce(terms[4], '%'),
           coalesce(terms[5], '%'),
           type_filter,
           municipality_filter,
           access_filter,
           accommodation,
           catering,
           event_facilities,
           after_name,
           after_id,
           page_size
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

comment on function search_public_heritage_objects(text, text[], text[], text[], boolean, boolean, boolean, text, uuid, integer) is
  'Public directory search and filters: one keyset page of published heritage objects matching every term of search_query and every given filter (AND across categories, OR within one). SECURITY INVOKER - every returned row and image is read under the caller''s Row Level Security.';

revoke all on function search_public_heritage_objects(text, text[], text[], text[], boolean, boolean, boolean, text, uuid, integer) from public;
grant execute on function search_public_heritage_objects(text, text[], text[], text[], boolean, boolean, boolean, text, uuid, integer)
  to anon, authenticated, service_role;

commit;
