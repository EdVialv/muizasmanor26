-- Day 18: condition, ownership and historical-family directory filters,
-- each with an explicit "unknown / not recorded" choice.
--
-- Builds on: 20261012195606_initial_heritage_schema.sql (condition_category,
--              ownership_type, object_historical_owner_families)
--            20261019175413_indexes_roles_rls.sql       (RLS, B-tree indexes)
--            20261114090000_directory_filters.sql      (Day 17 search-and-filter functions)
-- Notes:     docs/DAY18_CLASSIFICATION_FILTERS_NOTES.md
--
-- NOT APPLIED ANYWHERE by the session that wrote it; exercised only on a
-- disposable local PostgreSQL 16 + PostGIS database. Apply it after the
-- Day 15, 16 and 17 migrations. Like Day 17, it replaces the search
-- function's signature, so the Day 17 application code stops working once
-- this is applied: deploy the two together. No column is added and no data
-- is changed.
--
-- Decisions made while writing this migration (flagged for Codex review):
--
-- 1. Condition filters the stored condition_category values as they are
--    (docs/DATA_MODEL.md "Manor condition labels"); nothing is regrouped.
--
-- 2. Ownership filters by the two public groups docs/DATA_MODEL.md
--    ("Ownership filter groups") and docs/MVP_SCOPE.md define:
--      private = private_person, private_legal_entity
--      public  = municipality, state
--    It is unrelated to public_access (Day 17).
--
-- 3. A historical family is an object_historical_owner_families row with
--    verification_status = 'verified' - the same rule the Day 14 object page
--    uses to show families, so a filter never returns an object for a
--    family its page does not show. The schema has no family registry: a
--    family is identified by its *canonical* name (decision 8).
--
-- 4. "Unknown / not recorded" is the schema's own representation of missing
--    information, nothing else:
--      condition  -> condition_category IS NULL
--      ownership  -> ownership_type IS NULL
--      family     -> no verified family association with a non-empty
--                    (canonical) name
--    The schema cannot record "this object had no historical family", so
--    there is no such option; an absent association is always "not
--    recorded". No source data is rewritten.
--
-- 5. Within one filter the choices are ORed (known values and "unknown"
--    included); filters are ANDed. Family matching is a semi-join on ids
--    computed once per call, so an object linked to several selected
--    families is returned once.
--
-- 6. One partial index, on verified family associations by canonical name
--    (justified by measurement - see section 1). Condition and ownership
--    use the existing Day 9 B-tree indexes, which also serve IS NULL.
--
-- 7. The family options function is SECURITY DEFINER, for the reason and
--    with the limits given at its definition (section 2).
--
-- 8. One canonical family name, end to end. family_name is free text and
--    the schema does not stop "  Ābele " or a decomposed "Ābele" being
--    stored. Rather than rely on clean data (or rewrite it), every query
--    compares canonical_family_name(family_name): Unicode NFC, then leading
--    and trailing whitespace removed - exactly the characters JavaScript's
--    String.prototype.trim() removes, so the browser's normalizeFamily()
--    (src/lib/directory/filters.ts) produces the same string. Options are
--    grouped by it (no duplicate options, no split counts), the matching
--    function compares it, and the public function canonicalises its input
--    with it. A name that is empty after canonicalisation is not a family.
--    The index below is on the same expression.

begin;

-- ---------------------------------------------------------------------------
-- 1. Canonical family name (decision 8) and index (decision 6)
-- ---------------------------------------------------------------------------

-- NFC, then trim the JavaScript String.prototype.trim() whitespace set:
-- U+0009-U+000D, U+0020, U+00A0, U+1680, U+2000-U+200A, U+2028, U+2029,
-- U+202F, U+205F, U+3000, U+FEFF. NULL when nothing is left. Immutable, so
-- it can be indexed. Requires a UTF8 database (Supabase's encoding).
create function canonical_family_name(input text) returns text
  language sql
  immutable
  parallel safe
  set search_path = ''
as $$
  select nullif(
    pg_catalog.regexp_replace(
      normalize(input, NFC),
      '^[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+|[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$',
      '',
      'g'
    ),
    ''
  );
$$;

comment on function canonical_family_name(text) is
  'The one canonical form of a historical-family name for directory filters: Unicode NFC, leading/trailing whitespace removed (the JavaScript String.prototype.trim() set); NULL when empty. Must stay identical to normalizeFamily() in src/lib/directory/filters.ts.';

revoke all on function canonical_family_name(text) from public;
grant execute on function canonical_family_name(text) to anon, authenticated, service_role;

create index object_historical_owner_families_verified_name_idx
  on object_historical_owner_families (public.canonical_family_name(family_name), object_id)
  where verification_status = 'verified';


-- ---------------------------------------------------------------------------
-- 2. Family options: a bounded, searchable list (decision 3)
-- ---------------------------------------------------------------------------

-- Verified family names of published objects whose name or an alternate
-- spelling contains `search` (case- and diacritic-insensitive), with the
-- number of published objects for each, grouped by canonical name (decision
-- 8) - so "Ābele" and "  Ābele " are one option with one count. At most
-- row_limit rows (1..50), in the database's order of the canonical name.
--
-- SECURITY DEFINER (decision 7): it hard-codes status = 'published' and
-- verification_status = 'verified', so it returns less than anon may
-- already read from object_historical_owner_families under RLS, and only
-- names and counts. As SECURITY INVOKER, the RLS policy's EXISTS over
-- heritage_objects was evaluated as a hashed scan of every published
-- object on every call (measured: 3-6 ms at 10,643 objects, growing with
-- the directory). Each distinct name and spelling is folded once, after
-- grouping, rather than once per association; canonical names are
-- computed once per distinct stored spelling.
create function public_directory_historical_families(
  search text default null,
  row_limit integer default 20
) returns table (family_name text, object_count bigint)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  pattern text;
begin
  if btrim(coalesce(search, '')) <> '' then
    pattern := '%' || replace(replace(replace(
                 btrim(public.fold_search_text(left(search, 100))), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
    with links as (
      select f.family_name, f.object_id, f.alternate_spellings
      from public.object_historical_owner_families f
      join public.heritage_objects ho
        on ho.id = f.object_id
       and ho.status = 'published'
      where f.verification_status = 'verified'
    ),
    -- Canonicalised once per distinct stored spelling, not once per link.
    canonical as materialized (
      select d.family_name, public.canonical_family_name(d.family_name) as name
      from (select distinct l.family_name from links l) d
    ),
    families as (
      select
        c.name,
        count(distinct l.object_id) as objects,
        array_agg(distinct a.spelling) filter (where a.spelling is not null) as spellings
      from links l
      join canonical c
        on c.family_name = l.family_name
      left join lateral unnest(l.alternate_spellings) as a(spelling) on true
      where c.name is not null
        -- A name the URL parser would refuse (over 120 characters) could
        -- never be selected; do not offer it.
        and pg_catalog.length(c.name) <= 120
      group by c.name
    )
    select fam.name, fam.objects
    from families fam
    where pattern is null
       or public.fold_search_text(fam.name) like pattern
       or exists (
         select 1
         from unnest(fam.spellings) as s(spelling)
         where public.fold_search_text(s.spelling) like pattern
       )
    order by fam.name
    limit least(greatest(coalesce(row_limit, 20), 1), 50);
end;
$$;

comment on function public_directory_historical_families(text, integer) is
  'Historical-family filter options: verified family names of published objects matching search (name or alternate spelling, case- and diacritic-insensitive), with object counts; at most 50 rows. SECURITY DEFINER, but hard-codes published objects and verified associations and returns only names and counts - less than RLS already lets anon read.';

revoke all on function public_directory_historical_families(text, integer) from public;
grant execute on function public_directory_historical_families(text, integer)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Matching (replaces the Day 17 helper)
-- ---------------------------------------------------------------------------

drop function search_public_heritage_objects(text, text[], text[], text[], boolean, boolean, boolean, text, uuid, integer);
drop function private.search_published_object_keys(text, text, text, text, text, public.object_type[], text[], public.public_access_status[], boolean, boolean, boolean, text, uuid, integer);

-- As Day 17, plus: condition_types/ownership_types (NULL = no filter on the
-- known values) with *_unknown flags (true = also match NULL), and
-- family_names with family_unknown. A category is filtered when its array is
-- non-NULL or its unknown flag is true; then a row matches a known value OR
-- (when asked) a missing one.
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
  family_filtered boolean := family_names is not null or family_unknown is true;
  family_ids uuid[];
begin
  -- Ids of published objects with a verified association to any selected
  -- family, computed once (decision 5): a set, so an object linked to
  -- several selected families is still one id.
  if family_names is not null then
    select coalesce(array_agg(distinct f.object_id), '{}')
      into family_ids
      from public.object_historical_owner_families f
      join public.heritage_objects fo
        on fo.id = f.object_id
       and fo.status = 'published'
      where f.verification_status = 'verified'
        and public.canonical_family_name(f.family_name) = any (family_names);
  end if;

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
      )
      and (
        after_name is null
        or after_id is null
        or (ho.name_lv, ho.id) > (after_name, after_id)
      )
    order by ho.name_lv, ho.id
    limit least(greatest(coalesce(row_limit, 25), 1), 50);
end;
$$;

comment on function private.search_published_object_keys(text, text, text, text, text, public.object_type[], text[], public.public_access_status[], boolean, boolean, boolean, public.condition_category[], boolean, public.ownership_type[], boolean, text[], boolean, text, uuid, integer) is
  'SECURITY DEFINER, internal. Returns only ids of published heritage objects matching five LIKE patterns and the directory filters (Days 17-18), in directory order. Families count only verified associations. Exists so the predicates can use indexes, which Row Level Security prevents for non-leakproof operators. Never returns row data.';

revoke all on function private.search_published_object_keys(text, text, text, text, text, public.object_type[], text[], public.public_access_status[], boolean, boolean, boolean, public.condition_category[], boolean, public.ownership_type[], boolean, text[], boolean, text, uuid, integer)
  from public;
grant execute on function private.search_published_object_keys(text, text, text, text, text, public.object_type[], text[], public.public_access_status[], boolean, boolean, boolean, public.condition_category[], boolean, public.ownership_type[], boolean, text[], boolean, text, uuid, integer)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The public search-and-filter function
-- ---------------------------------------------------------------------------

-- As Day 17, plus:
--   condition_categories  condition_category values and/or 'unknown'
--   ownership_groups      'private', 'public' and/or 'unknown' (decision 2)
--   historical_families   verified family names, compared by canonical name
--   family_unknown        true = also match objects with no verified family
-- Unknown values are ignored; a category given only unusable values
-- matches nothing. At most 50 values per array; family names at most 120
-- characters.
create function search_public_heritage_objects(
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
  terms text[];
  type_filter object_type[];
  municipality_filter text[];
  access_filter public_access_status[];
  condition_filter condition_category[];
  condition_unknown boolean := false;
  ownership_filter ownership_type[];
  ownership_unknown boolean := false;
  family_filter text[];
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

  -- Condition: known enum values, plus 'unknown' for NULL.
  select array_agg(distinct v.value::condition_category)
    into condition_filter
    from (select unnest(condition_categories[1:50]) as value) v
    where v.value = any (enum_range(null::condition_category)::text[]);
  condition_unknown := coalesce('unknown' = any (condition_categories[1:50]), false);

  -- Ownership: the two documented groups, expanded to stored values.
  select array_agg(distinct o.value)
    into ownership_filter
    from (
      select unnest(case g.value
        when 'private' then array['private_person', 'private_legal_entity']::ownership_type[]
        when 'public' then array['municipality', 'state']::ownership_type[]
      end) as value
      from (select unnest(ownership_groups[1:50]) as value) g
    ) o
    where o.value is not null;
  ownership_unknown := coalesce('unknown' = any (ownership_groups[1:50]), false);

  -- Canonicalised exactly as stored names are compared (decision 8).
  select array_agg(distinct canonical_family_name(v.value))
    into family_filter
    from (select unnest(historical_families[1:50]) as value) v
    where canonical_family_name(v.value) is not null
      and length(canonical_family_name(v.value)) <= 120;

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
  if condition_categories is not null and cardinality(condition_categories) > 0
     and condition_filter is null and not condition_unknown then
    condition_filter := '{}';
  end if;
  if ownership_groups is not null and cardinality(ownership_groups) > 0
     and ownership_filter is null and not ownership_unknown then
    ownership_filter := '{}';
  end if;
  if historical_families is not null and cardinality(historical_families) > 0
     and family_filter is null and family_unknown is not true then
    family_filter := '{}';
  end if;

  if terms is null
     and type_filter is null
     and municipality_filter is null
     and access_filter is null
     and accommodation is not true
     and catering is not true
     and event_facilities is not true
     and condition_filter is null and not condition_unknown
     and ownership_filter is null and not ownership_unknown
     and family_filter is null and family_unknown is not true then
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
           condition_filter,
           condition_unknown,
           ownership_filter,
           ownership_unknown,
           family_filter,
           coalesce(family_unknown, false),
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

comment on function search_public_heritage_objects(text, text[], text[], text[], boolean, boolean, boolean, text[], text[], text[], boolean, text, uuid, integer) is
  'Public directory search and filters (Days 16-18): one keyset page of published heritage objects matching every term of search_query and every given filter (AND across categories, OR within one, "unknown" matching a missing value). SECURITY INVOKER - every returned row and image is read under the caller''s Row Level Security.';

revoke all on function search_public_heritage_objects(text, text[], text[], text[], boolean, boolean, boolean, text[], text[], text[], boolean, text, uuid, integer) from public;
grant execute on function search_public_heritage_objects(text, text[], text[], text[], boolean, boolean, boolean, text[], text[], text[], boolean, text, uuid, integer)
  to anon, authenticated, service_role;

commit;
