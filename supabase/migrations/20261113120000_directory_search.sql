-- Day 16: indexed, diacritic-insensitive directory search.
--
-- Builds on: 20261012195606_initial_heritage_schema.sql
--            20261019175413_indexes_roles_rls.sql   (pg_trgm, trigram indexes)
--            20261113090000_object_images_access.sql (object_images, public_access)
-- Search contract: docs/DATA_MODEL.md "Index and query requirements" -
--                  "GIN/trigram index over a maintained search document
--                  containing Latvian, alternate and historical names plus
--                  searchable location text."
-- Notes:           docs/DAY16_SEARCH_NOTES.md
--
-- NOT APPLIED ANYWHERE by the session that wrote it; exercised only on a
-- disposable local PostgreSQL 16 + PostGIS database. Apply it to
-- muizasmanor26-dev after review. The application works without it except
-- for search itself: /objects?q=... shows its error state until the
-- search_public_heritage_objects function exists. It is additive and safe
-- to apply while older application code is running.
--
-- What Day 9 already provided, and why it is not enough on its own:
-- trigram indexes on heritage_objects.name_lv, heritage_objects.municipality
-- and object_names.name. They support case-insensitive ILIKE, but (a) they
-- are diacritic-sensitive - "rundales" does not match "Rundāles" - and
-- (b) one search across names, alternate names and location needs an OR
-- over two tables, which cannot be combined with keyset pagination in a
-- single safely-parameterised public API request. Day 9's own decision 4
-- deferred the "maintained search document" to this day for that reason.
-- Those three indexes are left in place.
--
-- Decisions made while writing this migration (flagged for Codex review):
--
-- 1. One maintained column, heritage_objects.search_document, holds the
--    folded (unaccented, lower-cased) name_lv, municipality and every
--    object_names.name of the object. Triggers on both tables keep it
--    current, so a search is a single-table predicate with one index.
--
-- 2. Every object_names row is included, verified or not. Those rows are
--    already readable by the public for a published object (Day 9 policy
--    object_names_select_for_published_objects), and matching a search
--    against a name does not display it. Restricting to verified names is
--    a one-line change in build_heritage_object_search_document().
--
-- 3. Matching is substring matching of every whitespace-separated query
--    term against the folded document (AND across terms). It is
--    case-insensitive and diacritic-insensitive in both directions. It is
--    not stemming, not typo-tolerant and not ranked: results keep the
--    directory's own (name_lv, id) order so keyset pagination stays exact.
--
-- 4. Search is exposed as one SECURITY INVOKER function,
--    search_public_heritage_objects(). Every row and image it returns is
--    read as the calling role, so the Day 9 and Day 15 Row Level Security
--    policies still decide what is visible. Arguments arrive as bound
--    parameters; LIKE wildcards in the query are escaped.
--
--    It does not do the matching itself, for a measured reason. Under Row
--    Level Security, PostgreSQL will not use an index for a predicate whose
--    operator is not LEAKPROOF until the policy's own condition has been
--    applied - and LIKE is not leakproof. As the anon role, the search
--    predicate therefore never uses the trigram index: it is applied as a
--    filter over every published row (on 10,835 local rows, vacuumed: a
--    median 2.1-3.2 ms per page, removing ~10,800 rows by filter - growing
--    linearly with the table). So the matching is done by a small SECURITY
--    DEFINER function, private.search_published_object_keys(), which
--    returns ONLY the ids of matching PUBLISHED objects, in order (median
--    0.18-0.32 ms on the same data, using the indexes below). The public
--    function then reads those ids' rows under RLS as usual. The helper is
--    declared ROWS 50 (its hard upper bound): with the default estimate of
--    1,000 rows the planner hash-joined the ids against every published
--    row, which cost ~4 ms per call at 10,835 rows instead of ~0.2 ms.
--
--    The trigram index is only chosen once the table has been vacuumed: a
--    GIN index's pending list after a bulk load makes it look expensive.
--    Autovacuum handles this on a live database; after a large import, run
--    VACUUM ANALYZE heritage_objects.
--
--    What the definer function can reveal: which published objects match a
--    pattern - exactly what search is for. It selects nothing but ids, it
--    hard-codes status = 'published', and it lives in a `private` schema
--    the API does not expose, so it can only be reached through the public
--    function. If it ever returned an id it should not, the public
--    function's RLS-checked read would still drop that row.
--
-- 5. A partial B-tree index on (name_lv, id) for published rows is added.
--    Measured on 10,835 local rows (docs/DAY16_SEARCH_NOTES.md): a broad
--    search term reads one page from it in order instead of collecting
--    and sorting every match. docs/DATA_MODEL.md asks for composite/partial
--    indexes to "follow measured query plans" - this one does.

begin;

-- ---------------------------------------------------------------------------
-- 0. Extension (idempotent; same dedicated schema as PostGIS and pg_trgm)
-- ---------------------------------------------------------------------------

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Text folding
-- ---------------------------------------------------------------------------

-- Unaccent, then lower-case: "Rundāles pils" -> "rundales pils",
-- "Schloß" -> "schloss", "Nowa Myśl" -> "nowa mysl". The dictionary is named
-- explicitly (schema-qualified), so the result does not depend on the
-- caller's search_path.
create function fold_search_text(input text) returns text
  language sql
  stable
  parallel safe
  set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(input, '')));
$$;

comment on function fold_search_text(text) is
  'Folds text for search: removes diacritics (extensions.unaccent) and lower-cases. Used for both the stored search_document and the incoming query, so they always fold the same way.';

-- ---------------------------------------------------------------------------
-- 2. The maintained search document
-- ---------------------------------------------------------------------------

alter table heritage_objects
  add column search_document text not null default '';

comment on column heritage_objects.search_document is
  'Maintained by triggers: fold_search_text() of name_lv, municipality and every object_names.name of this object, space-separated. Never written by application code.';

create function build_heritage_object_search_document(
  p_object_id uuid,
  p_name_lv text,
  p_municipality text
) returns text
  language sql
  stable
  set search_path = ''
as $$
  select public.fold_search_text(
    concat_ws(
      ' ',
      p_name_lv,
      p_municipality,
      (
        select string_agg(n.name, ' ' order by n.name, n.id)
        from public.object_names n
        where n.object_id = p_object_id
      )
    )
  );
$$;

-- Internal helper: only the roles that write these tables need it. (On
-- Supabase, new functions in `public` are granted to the API roles by
-- default, so the revoke is explicit.)
revoke all on function build_heritage_object_search_document(uuid, text, text)
  from public, anon, authenticated;
grant execute on function build_heritage_object_search_document(uuid, text, text)
  to service_role;

-- heritage_objects: recompute when a searched column changes. BEFORE, so
-- the new value is written in the same row version. Not fired by the
-- object_names trigger's own UPDATE below (that changes search_document
-- only), so the two triggers cannot loop.
create function heritage_objects_set_search_document() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.search_document :=
    public.build_heritage_object_search_document(new.id, new.name_lv, new.municipality);
  return new;
end;
$$;

create trigger heritage_objects_search_document
  before insert or update of name_lv, municipality on heritage_objects
  for each row
  execute function heritage_objects_set_search_document();

-- object_names: any change to an object's names refreshes that object's
-- document (both objects, if a row is moved between them).
create function object_names_refresh_search_document() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.heritage_objects ho
      set search_document =
        public.build_heritage_object_search_document(ho.id, ho.name_lv, ho.municipality)
      where ho.id = old.object_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and (tg_op = 'INSERT' or new.object_id is distinct from old.object_id
          or new.name is distinct from old.name) then
    update public.heritage_objects ho
      set search_document =
        public.build_heritage_object_search_document(ho.id, ho.name_lv, ho.municipality)
      where ho.id = new.object_id;
  end if;
  return null;
end;
$$;

create trigger object_names_search_document
  after insert or update or delete on object_names
  for each row
  execute function object_names_refresh_search_document();

-- Backfill existing rows.
update heritage_objects ho
  set search_document =
    build_heritage_object_search_document(ho.id, ho.name_lv, ho.municipality);

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------

-- Substring search over the folded document.
create index heritage_objects_search_document_trgm_idx
  on heritage_objects using gin (search_document extensions.gin_trgm_ops);

-- The directory's own order, for published rows only (decision 5).
create index heritage_objects_published_name_id_idx
  on heritage_objects (name_lv, id)
  where status = 'published';

-- ---------------------------------------------------------------------------
-- 4. Matching: ids of published objects only (see decision 4)
-- ---------------------------------------------------------------------------

-- Not in an API-exposed schema: PostgREST serves `public` only, so this
-- function cannot be called through /rpc.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- p1..p5 are ready-made LIKE patterns ('%term%', or '%' for an unused
-- slot), already escaped by the caller. Returns at most row_limit ids of
-- PUBLISHED objects whose search_document matches all five, in
-- (name_lv, id) order, strictly after (after_name, after_id) when given.
--
-- plan_cache_mode = force_custom_plan: each call is planned with its real
-- patterns, so the planner can tell a rare term (use the trigram index)
-- from a broad one or an unused '%' slot (walk the ordered index) instead
-- of settling on one generic plan for both.
create function private.search_published_object_keys(
  p1 text,
  p2 text,
  p3 text,
  p4 text,
  p5 text,
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
      and (
        after_name is null
        or after_id is null
        or (ho.name_lv, ho.id) > (after_name, after_id)
      )
    order by ho.name_lv, ho.id
    limit least(greatest(coalesce(row_limit, 25), 1), 50);
end;
$$;

comment on function private.search_published_object_keys(text, text, text, text, text, text, uuid, integer) is
  'SECURITY DEFINER, internal. Returns only ids of published heritage objects matching five LIKE patterns, in directory order. Exists so the search predicate can use indexes, which Row Level Security prevents for the non-leakproof LIKE operator. Never returns row data.';

revoke all on function private.search_published_object_keys(text, text, text, text, text, text, uuid, integer)
  from public;
grant execute on function private.search_published_object_keys(text, text, text, text, text, text, uuid, integer)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. The public search function
-- ---------------------------------------------------------------------------

-- Returns one keyset page of published objects whose search_document
-- contains every term of search_query, in (name_lv, id) order, strictly
-- after (after_name, after_id) when both are given.
--
-- Bounds enforced here, whatever the caller sends: the query is cut to 200
-- characters and its first 5 terms; page_size is clamped to 1..50. A query
-- with no term returns no rows.
create function search_public_heritage_objects(
  search_query text,
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

  if terms is null then
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
           terms[1],
           coalesce(terms[2], '%'),
           coalesce(terms[3], '%'),
           coalesce(terms[4], '%'),
           coalesce(terms[5], '%'),
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

comment on function search_public_heritage_objects(text, text, uuid, integer) is
  'Public directory search: one keyset page of published heritage objects matching every term of search_query (diacritic- and case-insensitive substring match on search_document). SECURITY INVOKER - every returned row and image is read under the caller''s Row Level Security.';

revoke all on function search_public_heritage_objects(text, text, uuid, integer) from public;
grant execute on function search_public_heritage_objects(text, text, uuid, integer)
  to anon, authenticated, service_role;

commit;
