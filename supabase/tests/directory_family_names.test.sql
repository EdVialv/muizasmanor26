-- Day 18 regression test: historical-family names are canonicalised the same
-- way everywhere (docs/DAY18_CLASSIFICATION_FILTERS_NOTES.md, migration
-- 20261115090000 decision 8).
--
-- Run ONLY against a disposable local database that has every migration
-- applied - never against a shared or production project:
--
--   psql -v ON_ERROR_STOP=1 -d <local-db> -f supabase/tests/directory_family_names.test.sql
--
-- Everything happens inside one transaction that is rolled back; a failed
-- assertion raises an exception and the script stops with a non-zero exit.
-- The anon role must exist (as it does on Supabase).

begin;

-- 1. canonical_family_name(): NFC + the JavaScript String.prototype.trim()
--    whitespace set; inner whitespace kept; empty -> NULL. The same table
--    of cases is asserted for normalizeFamily() in
--    src/lib/directory/filters.test.ts.
do $$
declare
  c record;
begin
  for c in select * from (values
      ('Ābele', 'Ābele'),
      ('  Ābele ', 'Ābele'),
      (E'\tĀbele\n', 'Ābele'),
      (U&'A\0304bele', 'Ābele'),                       -- decomposed -> NFC
      (U&'\00A0Ābele\3000', 'Ābele'),                  -- no-break and ideographic space
      (U&'\FEFF\2003Ābele\2029', 'Ābele'),             -- BOM, em space, paragraph separator
      ('von der  Pahlen', 'von der  Pahlen'),          -- inner whitespace is kept
      ('   ', null),
      ('', null),
      (null, null)
    ) v(input, expected)
  loop
    if public.canonical_family_name(c.input) is distinct from c.expected then
      raise exception 'canonical_family_name(%) = %, expected %',
        quote_nullable(c.input), quote_nullable(public.canonical_family_name(c.input)), quote_nullable(c.expected);
    end if;
  end loop;
end $$;

-- 2. Fixture: one family stored in four spellings that canonicalise alike,
--    an unverified link, a draft, a blank name and a duplicate pair.
create temp table t_obj (key text primary key, id uuid);
with ins as (
  insert into heritage_objects (source_system, external_source_id, object_type, slug, name_lv, summary_lv,
                                municipality, latitude, longitude, status, source_url, last_verified_at)
  select 'family_names_test', 'fn-' || k, 'manor_estate', 'fn-test-' || k, 'Kvazitests ' || k || ' muiža',
         '[Testa dati]', 'Testa novads', 56.9, 24.1, s::object_status, 'https://example.invalid/fn', '2026-11-01'
  from (values ('a', 'published'), ('b', 'published'), ('c', 'published'), ('d', 'published'),
               ('e', 'draft'), ('f', 'published'), ('g', 'published')) v(k, s)
  returning id, external_source_id
)
insert into t_obj select substr(external_source_id, 4), id from ins;

insert into object_historical_owner_families (object_id, family_name, alternate_spellings, verification_status)
select o.id, v.name, v.alt, v.status::verification_status
from (values
    ('a', '  Kvazitestu Ābelzieds ', null::text[], 'verified'),        -- padded
    ('b', 'Kvazitestu Ābelzieds', array['Apfelzieds'], 'verified'),     -- clean
    ('c', U&'Kvazitestu A\0304belzieds\0009', null, 'verified'),        -- decomposed + tab
    ('d', 'Kvazitestu Ābelzieds', null, 'unverified'),                  -- unverified: never counts
    ('e', 'Kvazitestu Ābelzieds', null, 'verified'),                    -- draft object: never counts
    ('f', '   ', null, 'verified'),                                     -- blank: not a family
    ('g', 'Kvazitestu Bērziņzieds', null, 'verified'),
    ('g', U&'\00A0Kvazitestu Bērziņzieds\3000', null, 'verified')       -- same object, same canonical name
  ) v(k, name, alt, status)
join t_obj o on o.key = v.k;

grant select on t_obj to anon;
set local role anon;

-- 3. Options: one row per canonical name, merged counts, canonical text.
do $$
declare
  n integer;
  cnt bigint;
  name text;
begin
  select count(*), max(f.object_count), max(f.family_name)
    into n, cnt, name
    from public_directory_historical_families('kvazitestu abelzieds', 50) f;
  if n <> 1 or cnt <> 3 or name <> 'Kvazitestu Ābelzieds' then
    raise exception 'options for Ābelzieds: % rows, count %, name % (expected 1 row, 3, canonical)', n, cnt, quote_nullable(name);
  end if;

  -- Found through an alternate spelling too, still canonical and merged.
  select count(*), max(f.object_count) into n, cnt
    from public_directory_historical_families('apfelzieds', 50) f;
  if n <> 1 or cnt <> 3 then
    raise exception 'options via alternate spelling: % rows, count %', n, cnt;
  end if;

  -- Two links on one object that canonicalise alike count that object once.
  select count(*), max(f.object_count) into n, cnt
    from public_directory_historical_families('bērziņzieds', 50) f;
  if n <> 1 or cnt <> 1 then
    raise exception 'options for Bērziņzieds: % rows, count % (expected 1, 1)', n, cnt;
  end if;

  -- No option is ever blank or padded.
  select count(*) into n
    from public_directory_historical_families(null, 50) f
    where f.family_name is distinct from public.canonical_family_name(f.family_name);
  if n <> 0 then
    raise exception '% options are not in canonical form', n;
  end if;
end $$;

-- 4. Matching: the canonical name - however the caller spells it - finds
--    every published object whose verified link canonicalises to it, once.
do $$
declare
  spelling text;
  got text[];
begin
  foreach spelling in array array['Kvazitestu Ābelzieds', '  Kvazitestu Ābelzieds  ',
                                  U&'Kvazitestu A\0304belzieds', U&'\00A0Kvazitestu Ābelzieds']
  loop
    select array_agg(s.slug order by s.slug) into got
      from search_public_heritage_objects(historical_families => array[spelling], page_size => 50) s;
    if got is distinct from array['fn-test-a', 'fn-test-b', 'fn-test-c'] then
      raise exception 'family % matched %, expected a, b, c', quote_literal(spelling), got;
    end if;
  end loop;

  select array_agg(s.slug order by s.slug) into got
    from search_public_heritage_objects(historical_families => array['Kvazitestu Bērziņzieds'], page_size => 50) s;
  if got is distinct from array['fn-test-g'] then
    raise exception 'duplicate canonical links: matched %, expected g once', got;
  end if;

  -- A blank-only selection is no family at all: nothing matches.
  select array_agg(s.slug) into got
    from search_public_heritage_objects(historical_families => array['   '], page_size => 50) s;
  if got is not null then
    raise exception 'blank family selection matched %', got;
  end if;

  -- "Not recorded": no verified link with a non-empty canonical name. The
  -- blank-named object f and the unverified-only object d qualify; a, b, c, g
  -- do not; the draft e never appears.
  select array_agg(s.slug order by s.slug) into got
    from search_public_heritage_objects(search_query => 'kvazitests', family_unknown => true, page_size => 50) s;
  if got is distinct from array['fn-test-d', 'fn-test-f'] then
    raise exception 'family_unknown matched %, expected d, f', got;
  end if;
end $$;

reset role;
rollback;

\echo 'directory_family_names.test.sql: all assertions passed'
