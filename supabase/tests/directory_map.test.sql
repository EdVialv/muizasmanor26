-- Day 19 regression test: the map viewport query (public_map_objects) -
-- viewport validation and boundaries, public visibility, list/map
-- consistency, invalid and identical coordinates, bounded responses.
-- docs/DAY19_MAP_NOTES.md; migration 20261116090000_directory_map.sql.
--
-- Run ONLY against a disposable local database that has every migration
-- applied - never against a shared or production project:
--
--   psql -v ON_ERROR_STOP=1 -d <local-db> -f supabase/tests/directory_map.test.sql
--
-- Everything happens inside one transaction that is rolled back; a failed
-- assertion raises an exception. The anon role must exist (as on Supabase).

begin;

-- Fixtures, all named "Kvazikarte ..." so searches can isolate them from
-- whatever else the database holds.
insert into heritage_objects (source_system, external_source_id, object_type, slug, name_lv, summary_lv,
                              municipality, latitude, longitude, status, source_url, last_verified_at,
                              condition_category, ownership_type)
select 'map_test', 'mt-' || g,
       case when g <= 100 then 'outbuilding' else 'manor_estate' end::object_type,
       'mt-dense-' || g, 'Kvazikarte blīvs ' || lpad(g::text, 3, '0'), '[Testa dati]', 'Testa novads',
       56.50 + (g % 23) * 0.0004, 25.50 + (g / 23) * 0.0004,
       'published', 'https://example.invalid/mt', '2026-11-01',
       case when g % 3 = 0 then 'class_a'::condition_category end, null
from generate_series(1, 520) g;

insert into heritage_objects (source_system, external_source_id, object_type, slug, name_lv, summary_lv,
                              municipality, latitude, longitude, status, source_url, last_verified_at)
values
  ('map_test', 'mt-same-a', 'manor_house', 'mt-same-a', 'Kvazikarte kopīgs punkts A', '[Testa dati]', 'Testa novads', 57.10000, 26.10000, 'published', 'https://example.invalid/mt', '2026-11-01'),
  ('map_test', 'mt-same-b', 'outbuilding', 'mt-same-b', 'Kvazikarte kopīgs punkts B', '[Testa dati]', 'Testa novads', 57.10000, 26.10000, 'published', 'https://example.invalid/mt', '2026-11-01'),
  ('map_test', 'mt-edge', 'manor_house', 'mt-edge', 'Kvazikarte malas punkts', '[Testa dati]', 'Testa novads', 57.20000, 26.20000, 'published', 'https://example.invalid/mt', '2026-11-01'),
  ('map_test', 'mt-outside', 'manor_house', 'mt-outside', 'Kvazikarte ārpus Latvijas', '[Testa dati]', 'Testa novads', 54.35200, 18.64660, 'published', 'https://example.invalid/mt', '2026-11-01'),
  ('map_test', 'mt-zero', 'manor_house', 'mt-zero', 'Kvazikarte nulles punkts', '[Testa dati]', 'Testa novads', 0, 0, 'published', 'https://example.invalid/mt', '2026-11-01'),
  ('map_test', 'mt-draft', 'manor_house', 'mt-draft', 'Kvazikarte melnraksts', '[Testa dati]', 'Testa novads', 57.10000, 26.10000, 'draft', 'https://example.invalid/mt', '2026-11-01');

set local role anon;

do $$
declare
  n bigint;
  total bigint;
  kinds text;
  got text[];
  expected text[];
  c record;
  r record;
  ln text;
  li uuid;
  page integer;
begin
  -- 1. Bounded response: 520 matches -> clusters with an exact total, no
  --    truncated point list.
  select count(*), sum(object_count), string_agg(distinct kind, ',' order by kind)
    into n, total, kinds
    from public_map_objects(25.40, 56.40, 25.60, 56.60, 12, search_query => 'kvazikarte blivs');
  if total <> 520 or kinds not like '%cluster%' or n > 32 * 32 then
    raise exception 'dense viewport: % rows, total %, kinds % (expected clusters totalling 520)', n, total, kinds;
  end if;

  -- Every cluster's extent lies inside the requested rectangle.
  select count(*) into n
    from public_map_objects(25.40, 56.40, 25.60, 56.60, 12, search_query => 'kvazikarte blivs') m
    where m.min_longitude < 25.40 or m.max_longitude > 25.60
       or m.min_latitude < 56.40 or m.max_latitude > 56.60;
  if n <> 0 then
    raise exception '% clusters reach outside the viewport', n;
  end if;

  -- 2. At most 500: every match as a point. A filter narrows 520 to 100.
  select count(*), string_agg(distinct kind, ',') into n, kinds
    from public_map_objects(25.40, 56.40, 25.60, 56.60, 12,
                            search_query => 'kvazikarte blivs', object_types => '{outbuilding}');
  if n <> 100 or kinds <> 'object' then
    raise exception 'filtered viewport: % rows of kind % (expected 100 objects)', n, kinds;
  end if;

  -- 3. List/map consistency: for several searches and filters, the map's
  --    points in a viewport are exactly the list's results (walked page by
  --    page through search_public_heritage_objects) that fall inside it.
  for c in select * from (values
      ('kvazikarte', null::text[], null::text[], null::text[], 25.40::float8, 56.40::float8, 25.48::float8, 56.60::float8),
      ('kvazikarte blivs', '{outbuilding}', null, null, 25.40, 56.40, 25.60, 56.60),
      ('kvazikarte', null, '{class_a}', null, 25.40, 56.40, 25.60, 56.60),
      ('kvazikarte', null, '{unknown}', null, 25.40, 56.40, 25.47, 56.60),
      ('kvazikarte', null, null, '{unknown}', 26.00, 57.00, 26.30, 57.30)
    ) v(q, types, conditions, ownership, w, s, e, nn)
  loop
    select array_agg(m.slug order by m.slug) into got
      from public_map_objects(c.w, c.s, c.e, c.nn, 14, search_query => c.q, object_types => c.types,
                              condition_categories => c.conditions, ownership_groups => c.ownership) m
      where m.kind = 'object';

    expected := '{}';
    ln := null;
    li := null;
    loop
      page := 0;
      for r in
        select l.id, l.slug, l.name_lv
        from search_public_heritage_objects(search_query => c.q, object_types => c.types,
                                            condition_categories => c.conditions,
                                            ownership_groups => c.ownership,
                                            after_name => ln, after_id => li, page_size => 50) l
      loop
        page := page + 1;
        ln := r.name_lv;
        li := r.id;
        if exists (select 1 from heritage_objects h
                   where h.id = r.id
                     and h.longitude between c.w and c.e
                     and h.latitude between c.s and c.nn
                     and h.latitude between 55.60 and 58.15
                     and h.longitude between 20.90 and 28.30) then
          expected := expected || r.slug;
        end if;
      end loop;
      exit when page < 50;
    end loop;
    select array_agg(x order by x) into expected from unnest(expected) x;

    if got is distinct from expected then
      raise exception 'list/map mismatch for % % % %: map % / list %', c.q, c.types, c.conditions, c.ownership,
        coalesce(cardinality(got), 0), coalesce(cardinality(expected), 0);
    end if;
  end loop;

  -- 4. Identical coordinates: both objects come back, each once.
  select array_agg(m.slug order by m.slug) into got
    from public_map_objects(26.05, 57.05, 26.15, 57.15, 16, search_query => 'kvazikarte') m;
  if got is distinct from array['mt-same-a', 'mt-same-b'] then
    raise exception 'identical coordinates: got %', got;
  end if;

  -- 5. Boundaries are inclusive on every side; a point just outside is not.
  for c in select * from (values
      (26.20::float8, 57.15::float8, 26.25::float8, 57.25::float8),  -- west edge
      (26.15, 57.20, 26.25, 57.25),                                   -- south edge
      (26.15, 57.15, 26.20, 57.25),                                   -- east edge
      (26.15, 57.15, 26.25, 57.20)                                    -- north edge
    ) v(w, s, e, nn)
  loop
    if not exists (select 1 from public_map_objects(c.w, c.s, c.e, c.nn, 14, search_query => 'kvazikarte malas')) then
      raise exception 'edge point missing for %,%,%,%', c.w, c.s, c.e, c.nn;
    end if;
  end loop;
  if exists (select 1 from public_map_objects(26.2001, 57.15, 26.25, 57.25, 14, search_query => 'kvazikarte malas')) then
    raise exception 'point outside the viewport returned';
  end if;

  -- 6. Invalid map locations (outside Latvia, 0/0) and drafts never appear,
  --    even for a whole-world viewport; the outside object is still listed.
  select count(*) into n
    from public_map_objects(-180, -90, 180, 90, 2, search_query => 'kvazikarte') m
    where m.slug in ('mt-outside', 'mt-zero', 'mt-draft')
       or (m.kind = 'cluster' and (m.min_latitude < 55.60 or m.min_longitude < 20.90));
  if n <> 0 then
    raise exception 'outside/zero/draft objects reached the map (% rows)', n;
  end if;
  if not exists (select 1 from search_public_heritage_objects(search_query => 'kvazikarte arpus') l
                 where l.slug = 'mt-outside') then
    raise exception 'object outside Latvia is missing from the list';
  end if;
  if exists (select 1 from search_public_heritage_objects(search_query => 'kvazikarte melnraksts')) then
    raise exception 'draft listed';
  end if;

  -- 7. Invalid viewports return nothing rather than an error.
  select count(*) into n from (
    select 1 from public_map_objects(26.3, 57.0, 26.0, 57.3, 12)                 -- west > east
    union all select 1 from public_map_objects(26.0, 57.3, 26.3, 57.0, 12)       -- south > north
    union all select 1 from public_map_objects('NaN', 57.0, 26.3, 57.3, 12)
    union all select 1 from public_map_objects(26.0, 57.0, 'Infinity', 57.3, 12)
    union all select 1 from public_map_objects(null, 57.0, 26.3, 57.3, 12)
    union all select 1 from public_map_objects(10.0, 50.0, 15.0, 52.0, 12)       -- valid, but no overlap with Latvia
  ) x;
  if n <> 0 then
    raise exception 'invalid viewports returned % rows', n;
  end if;
end $$;

reset role;
rollback;

\echo 'directory_map.test.sql: all assertions passed'
