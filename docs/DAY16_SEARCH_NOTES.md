# Day 16 — indexed multilingual directory search

The Day 16 deliverable from `TODO.md`: "Implement indexed multilingual name/location search with debouncing and no-result guidance" (issue [#9](https://github.com/EdVialv/muizasmanor26/issues/9)). Built on the Day 15 commit (`claude/day15-visual-alpha`). No filters, maps or other Day 17+ features.

## Deployment requirement

**Apply `supabase/migrations/20261113120000_directory_search.sql` after the Day 15 migration (`20261113090000_object_images_access.sql`), before deploying this code.** Neither has been applied anywhere. Until the search migration exists, `/objects?q=…` shows its "Meklēšana neizdevās" error state; the plain directory and object pages are unaffected. The migration is additive and safe to apply while older code is running. It:

- enables the `unaccent` extension in the `extensions` schema (Supabase lists `unaccent` among its available extensions; this was not checked against the real project);
- adds `heritage_objects.search_document` and backfills it for every existing row;
- adds two indexes, two triggers, a `private` schema and two functions (below).

After any large bulk import, run `VACUUM ANALYZE heritage_objects` (autovacuum does this eventually). Until a GIN index's pending list has been flushed, the planner may not choose it — see "Performance".

## What this delivers

- A labelled search field above the directory (`src/components/DirectorySearchField.tsx`, placed in `src/app/objects/(directory)/layout.tsx`).
- Server-side search on `/objects?q=…`, with the same cards, keyset pagination and loading state as the directory (`src/app/objects/(directory)/page.tsx`, `src/lib/directory/search.ts`, `searchQuery.ts`, `supabaseSearchDataSource.ts`).
- Search-scoped cursors (`src/lib/directory/cursor.ts`) and search-aware "back to the directory" links on object pages (`src/lib/directory/links.ts`).
- The migration above.
- 56 new tests (266 → 322).

## Matching behaviour

A query matches an object when **every** term of the query occurs, as a substring, somewhere in the object's search document:

- `heritage_objects.name_lv`;
- `heritage_objects.municipality` — the only location text column in the schema;
- every `object_names.name` of the object — alternate and historical names, in any language (e.g. `Tymanow`, `Dobroczin`, `Nowa Myśl`).

Both the stored document and the query are folded the same way by `fold_search_text()`: `unaccent`, then lower-case. So:

- **Case-insensitive:** `TĪMAŅU MUIŽA` = `tīmaņu muiža`.
- **Diacritic-insensitive in both directions:** `timanu` finds `Tīmaņu muiža`, and `rundāle` finds a name typed without marks. All Latvian letters fold (`ĀČĒĢĪĶĻŅŠŪŽ` → `acegiklnsuz`), as do the old-orthography `ō`/`ŗ` and common historical-name letters (`ß` → `ss`, `ł` → `l`, `ś` → `s`, `ą`/`ę` → `a`/`e`).
- **Terms in any order, across fields:** `novads kraslavas dagdas` finds Dagdas muiža (name + municipality).
- **Whitespace:** collapsed and trimmed; empty or whitespace-only queries show the plain directory.
- **Bounds:** at most 200 characters and the first 5 terms — enforced in the browser, on the server and again in the database function.
- **Literal input:** `%`, `_` and `\` are escaped, so `m_iza` and `100%` are searched for literally; SQL-shaped input is just text.

**Limitations.**

- **No stemming.** A term must be a substring. `sigulda` finds `Siguldas novads`, and `rundale` finds `Rundāles`, because the inflected form contains the query. But `cēsis` does not find `Cēsu novads`, and `pils` (nominative) does not find a genitive-only `pilī`. Visitors should type a shorter stem; the no-match message says so.
- **No typo tolerance and no relevance ranking.** Results stay in the directory's `(name_lv, id)` order, which is what keeps keyset pagination exact.
- **Terms of 1–2 characters cannot use the trigram index**, so a rare 2-character term reads every published row (still bounded by the page limit; 1.8 ms at 10,835 rows locally).
- **Every `object_names` row is searchable, verified or not** (decision 2). Matching on a name does not display it.
- **The address text is not searched.** It is not a column of `heritage_objects`; the municipality is. The municipality mapping is still an open editorial task (Day 11).

## How it is built

**Database** (see the migration header for the full reasoning):

1. `search_document` holds the folded name, municipality and all names of the object, space-separated. A `BEFORE INSERT/UPDATE OF name_lv, municipality` trigger on `heritage_objects` and an `AFTER` trigger on `object_names` keep it current. Application code never writes it. The Day 10 importer's promotion path therefore fills it automatically.
2. A GIN trigram index on `search_document`, and a partial B-tree on `(name_lv, id) WHERE status = 'published'` (which also serves the Day 13 directory's own order).
3. `search_public_heritage_objects(search_query, after_name, after_id, page_size)` — the only function the API exposes for search. `SECURITY INVOKER`: every row and cover image it returns is read under the caller's Row Level Security. It folds and splits the query, escapes `LIKE` wildcards, clamps `page_size` to 1–50 and returns one keyset page in `(name_lv, id)` order.
4. `private.search_published_object_keys(...)` — a small `SECURITY DEFINER` helper that returns **only the ids** of matching **published** objects, in order. It exists because under RLS, PostgreSQL will not use an index for a non-`LEAKPROOF` operator such as `LIKE` before the policy condition is applied. As `anon`, the search predicate would otherwise be a filter over every published row. The `private` schema is not exposed by PostgREST, so the helper is reachable only through the public function, which then re-reads those ids under RLS.

**Application:**

- **URL as the single source of truth.** `/objects?q=…&cursor=…` decides what the server renders, so refresh, sharing and Back/Forward work. The field only edits the URL.
- **Debounce.** The field commits the query 300 ms after the last keystroke. Enter and "Notīrīt" commit at once. An edit that does not change the normalised query (e.g. extra spaces) does nothing, so it cannot reset the page.
- **Pagination reset and binding.** A committed query always drops `cursor`. Every search cursor also carries `scope` — a 64-bit FNV-1a fingerprint of the normalised query. The page uses a cursor only when its scope matches the current listing: this exact search, or none for the plain directory. Otherwise it starts that listing on page 1 and shows the "invalid link" notice. "Nākamā lapa" keeps `q`.
- **Stale responses.** Navigations run in a React transition. The App Router renders only the newest navigation, and the server renders results for the URL it received. The field also never overwrites what the visitor is still typing when an older URL lands. Verified with a deliberately slow older query (below).
- **States.** Pending ("Meklē…" in a polite live region with reserved height, so nothing shifts); results with a "Meklēšanas rezultāti: „…”" heading; no match ("Nekas netika atrasts", with guidance and a link to the full directory); a search-specific error state; clearing.
- **The field lives in a layout above `loading.tsx`.** While results load, only the results area is replaced; the field keeps its text, caret and focus.
- **Without JavaScript** the field is a plain `GET` form to `/objects`.
- **Back links.** Cards carry `fromQ` and `from`, so an object page's "Atpakaļ uz katalogu" returns to the same search page; both are validated again on the object page.
- **Parameterised access.** The query and keyset position are named RPC arguments (bound function parameters). No user input is interpolated into SQL or a PostgREST filter string.

## Performance

Measured only on a disposable local PostgreSQL 16 in this session's sandbox — not on Supabase and not under load. The data was the real workbook's 902 in-scope objects plus 11 synthetic copies of each (distinct slugs, suffixed names, copied alternate names): **10,835 published rows, 17,364 `object_names` rows**. Tables were vacuumed. Times are medians of 21 runs of `search_public_heritage_objects(…, page_size => 25)` as `anon`:

| Query                                  | Rows |  Median |
| -------------------------------------- | ---: | ------: |
| `timanu` (selective name)              |   12 | 0.45 ms |
| `tymanow` (alternate name)             |   12 | 0.20 ms |
| `muiza` (broad, ~90% of rows), page 1  |   25 | 0.19 ms |
| `muiza`, deep page                     |   25 | 0.24 ms |
| `jelgavas pils` (two terms)            |   12 | 0.28 ms |
| `kraslavas novads` (location)          |   25 | 0.40 ms |
| `ab` (2 characters, common)            |   25 | 0.18 ms |
| `xq` (2 characters, rare — no trigram) |    0 | 1.86 ms |
| `zzzqqq` (no match)                    |    0 | 0.12 ms |

For comparison on the same data, the single-statement approach without the definer helper (the same `LIKE` predicate, run directly as `anon` under RLS) took a median of **2.1–3.2 ms** per page. Its plan filtered all ~10,800 published rows ("Rows Removed by Filter: 10823"), so it grows linearly with the table. The helper's plan uses a bitmap scan on the trigram index for selective terms and walks the partial `(name_lv, id)` index for broad ones; both are bounded by the page size, not the table size.

Two issues were found and fixed while measuring:

- **`ROWS 50` on both functions.** With PostgreSQL's default estimate of 1,000 rows for a set-returning function, the planner hash-joined the returned ids against every published row: ~4 ms per call at 10,835 rows, growing linearly. With `ROWS 50` (the helper's real upper bound) it uses primary-key lookups: ~0.2 ms.
- **GIN pending list.** Immediately after a bulk load, before `VACUUM`, the planner chose a sequential scan over the trigram index. After `VACUUM ANALYZE` it used the index. Autovacuum handles this on a live database; run it manually after a large import.

Index sizes at 10,835 rows: trigram GIN 5.9 MB, partial B-tree 1.1 MB. The average `search_document` length was 51 characters.

## Decisions requiring Codex review

1. **A `SECURITY DEFINER` helper that returns only ids** (above). Its exposure is limited to "which published objects match this pattern", which is the purpose of search. It hard-codes `status = 'published'`, selects nothing but ids, and is not API-exposed. The public function re-reads its rows under RLS.
2. **All `object_names` rows are searchable, verified or not.** The Day 9 RLS policy already lets the public read them for a published object. Restricting search to verified names is a one-line change in `build_heritage_object_search_document()`.
3. **Substring matching, not full-text search.** Latvian has no built-in PostgreSQL text-search configuration. Stemming with `simple` would not stem, and a custom dictionary is more than an MVP needs. Substring matching on a folded document handles diacritics, case, alternate names and inflected forms that contain the typed stem.
4. **Results are not ranked.** Directory order keeps keyset pagination exact and simple. Ranking would need a different cursor (rank, name, id) and is a candidate for a later day.
5. **Cursor scope is a fingerprint of the normalised, unfolded query.** `Rundāles` and `rundales` are different scopes even though they return the same rows, so a cursor never carries over between them; the visitor simply starts at page 1. This is conservative by design.
6. **Back/Forward creates one history entry per committed search** (`router.push`), not per keystroke — the 300 ms debounce limits how many.

## Verification

Run on Node 22.23.4. The repo requires Node ≥ 24; npm only warns. CI on Node 24 is the authoritative result.

- `npm run format:check` — passed.
- `npm run lint` — passed.
- `npm run typecheck` — passed (also after `next build`).
- `npm test` — passed: 35 files, **322 tests** (266 → 322).
- `npm run build` — passed; `/objects` and `/objects/[slug]` are dynamic, `/` is static.
- `npm audit --omit=dev` — 0 vulnerabilities.

**Database checks** — on a disposable local PostgreSQL 16 + PostGIS, all five migrations applied in order from an empty database, with the Supabase `anon`/`authenticated`/`service_role` roles. Through the public function as `anon`, on the realistic 902-object data:

- `timanu` and `TĪMAŅU MUIŽA` → Tīmaņu muiža. `Tymanow` (historical Polish name) → Tīmaņu muiža. `nowa mysl` → Jaundomes muiža (alternate name `Nowa Myśl`). `kraslavas` → the 8 objects in Krāslavas novads. `novads kraslavas dagdas` → Dagdas muiža. `"   rundāles \t  pils  "` → the palace and its park.
- Empty, whitespace-only and `NULL` queries → no rows. `zzzqqq` → no rows. `%` and `m_iza` → no rows (wildcards are literal). `' or 1=1 --` → no rows.
- A draft object (the Rundāle stables) is never returned, although its `search_document` matches.
- `page_size => 100000` returns 50.
- `anon` cannot call `build_heritage_object_search_document()` (permission denied).
- **Pagination against ground truth:** every page of six searches was walked through the function, 24 rows at a time, and compared with a single `ORDER BY name_lv, id` query. The ids and order were identical, with no duplicates and no gaps. Realistic data: `muiza` 819, `pils` 122, `novads` 827, `kraslavas` 8, `a` 902, `jelgavas muiza` 60. Scaled data: up to 10,835 rows over 452 pages.
- **Triggers:** renaming an object, moving its municipality, and adding, editing or deleting an alternate name each updated `search_document` immediately (checked inside a rolled-back transaction).

**Browser, with Playwright against `next start` on that database through a real PostgREST 12.2.3** — 23 of 23 checks passed:

- **URL and field:** `?q=timanu` renders results and fills the field. Typing `TĪMAŅU MUIŽA` reaches the URL after the debounce. Alternate-name, location and whitespace searches give the results listed above, and whitespace is collapsed in the URL.
- **States:** a query with no match shows "Nekas netika atrasts". "Notīrīt" returns to `/objects` and keeps focus in the field.
- **Pagination:**
  - all 35 pages of `muiza` were walked: 819 results, all distinct, matching the database's ground truth of 819;
  - page 2 keeps `q` and a cursor, and a refresh there shows the same cards;
  - typing a new query on page 2 starts on page 1 with no cursor.
- **Back/Forward:** both restore the URL, the field text and the results.
- **Stale responses:** the local proxy held back every `rund` search for 2.5 s (`/objects?q=rund` took 2.52 s via the app; `q=rundale` took 0.016 s). While `rund` was in flight, "Meklē…" was announced, and the visitor typed on to `rundale`. More than 3 s later, the URL, field and results heading still showed `rundale`. The slow `rund` response never replaced them.
- **Back links:** search page 2 → an object → "Atpakaļ uz katalogu" returns to the same URL with the same cards.
- **Keyboard:** Tab reaches the field with a visible 3 px outline; typing and Enter searches.
- **Layout:** no horizontal overflow at 360 px on search results, the no-match state and the plain directory.

**Screenshots** in `docs/day16-screenshots/` show search results on desktop and mobile, and the no-match state on mobile. The pictures in them are labelled stand-ins: the image host is unreachable from this sandbox, as on Day 15. Names and locations are real.

**Not verified:** anything against the real `muizasmanor26-dev` project (it has no published objects and none of the Day 15/16 migrations); `unaccent` availability there; performance on Supabase hardware or under concurrent load.

## Known limitations

- **Admin writes as `authenticated` will need a grant.** `build_heritage_object_search_document()` is executable only by `service_role` (and the owner). Today every write goes through the importer as a privileged role, so the triggers work. When Day 21–22 let editors write through the API as `authenticated`, grant `EXECUTE` to that role or make the trigger functions `SECURITY DEFINER`.
- **No stemming, typo tolerance or ranking** (see "Matching behaviour").
- **The search query is shown in the page heading and the no-match text**, escaped by React. It is not used in the page `<title>`.
- **Municipality in the local test data was a heuristic** (the first part of the free-text address), as on Day 15; location search on real data depends on the open municipality mapping.
- **Day 13's one-time focus reset during a Suspense swap** no longer affects the search field, which sits above the boundary, but still applies to Tab order inside the results area while it loads.
