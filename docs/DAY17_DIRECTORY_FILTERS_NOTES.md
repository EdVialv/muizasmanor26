# Day 17 — directory filters

The Day 17 deliverable from `TODO.md`: "Add object-type, region, public-access, accommodation, catering and event filters" (issue [#9](https://github.com/EdVialv/muizasmanor26/issues/9)). Built on the accepted Day 16 baseline, `main` at `f3311e7` ("Advance roadmap to Day 17 (#43)"). Condition, ownership and historical-family filters are Day 18. There are no maps, booking, payments, admin workflows or redesign here.

## Deployment requirement

**Apply `supabase/migrations/20261114090000_directory_filters.sql` after the Day 15 migration (`20261113090000_object_images_access.sql`) and the Day 16 migration (`20261113120000_directory_search.sql`). Deploy it together with this code.**

None of the three migrations has been applied anywhere. This one **replaces** the Day 16 function `search_public_heritage_objects(text, text, uuid, integer)` with a version that also takes filters. Two consequences follow:

- Day 16 code calling the old signature fails once this migration is applied.
- Day 17 code fails until it is applied. Search and filters then show their "Meklēšana neizdevās" / "Atlase neizdevās" error state.

The plain directory and object pages are unaffected either way.

After applying, run `VACUUM ANALYZE heritage_objects`, as for Day 16.

## Filter-to-schema mapping

| Filter (URL param)                      | Field                                                                  | Match                   | Notes                                                                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Object type (`type`)                    | `heritage_objects.object_type` (enum `object_type`, Day 8)             | `= any(selected)`       | All seven enum values are offered. Labels come from `labels.ts`.                                                                                        |
| Region (`region`)                       | `heritage_objects.municipality` (text, Day 8)                          | Exact `= any(selected)` | This is the only geographic classification stored. The options are the distinct published values with counts, from `public_directory_municipalities()`. |
| Public access (`access`)                | `heritage_objects.public_access` (enum `public_access_status`, Day 15) | `= any(selected)`       | This is visitor access. It is unrelated to `ownership_type`; the UI says so next to the group.                                                          |
| Accommodation (`service=accommodation`) | **new** `heritage_objects.offers_accommodation boolean`                | `is true`               | Missing until this migration. Nullable and not backfilled.                                                                                              |
| Catering (`service=catering`)           | **new** `heritage_objects.offers_catering boolean`                     | `is true`               | Same rules as accommodation.                                                                                                                            |
| Events (`service=events`)               | **new** `heritage_objects.offers_event_facilities boolean`             | `is true`               | Means event services or a venue, not a calendar of dated events.                                                                                        |
| —                                       | **new** `heritage_objects.services_verified_at date`                   | —                       | Mirrors Day 15's `access_verified_at`. It is not used by any filter yet.                                                                                |

### The services gap

Before Day 17 the schema had nowhere to record accommodation, catering or event availability. `docs/DATA_MODEL.md` lists them only as "Recommended fields", without a shape.

The migration adds the smallest shape that keeps "unknown" separate from "no": three nullable booleans plus a verification date.

- `true` means recorded as offered.
- `false` means recorded as not offered.
- `NULL` means not recorded.

No value is backfilled. Nothing in the source workbook records these services, and they must not be inferred from descriptions (`DATA_MODEL.md`: "Do not infer … commercial services"; "Keep unknown values null").

**Consequence: on real data every service filter returns no objects until editors record services.** The no-results message explains that objects whose information is not recorded are not shown. `public_access` is in the same position; it was added by Day 15 and is still unpopulated.

## Filtering rules

- **Across categories: AND.** For example, type ∧ region ∧ access ∧ services.
- **Within a category: OR.** For example, `type=palace_or_castle&type=manor_house`.
- **Services are independent.** Each ticked service must be recorded as offered, so `service=accommodation&service=catering` requires both.
- **Unknown is unknown.** A positive filter matches only recorded values: `NULL` services, a `NULL` access value and a `NULL` municipality never match. `false` never matches either. There is no "not offered" filter.
- **No inheritance.** `DATA_MODEL.md` defines none, so an object is filtered only on its own values, never its parent's.
- **Access ≠ ownership.** `public_access` is filtered; `ownership_type` is not touched. Its filter is Day 18.
- **Same order and pagination.** Every filtered listing uses the same `(name_lv, id)` keyset order as the directory and search, with `page_size + 1` rows to detect a next page.
- **Unknown values in the URL** (`type=bogus`) are dropped before the query and the page shows "Daži saites filtri nebija derīgi un netika ņemti vērā." The database function also ignores unknown values instead of raising an error.
  - The URL is normalised, not rejected: a category left with no valid values counts as not selected, so `?type=bogus` shows the unfiltered listing with the notice, and the canonical links on that page no longer carry the bad value.
  - The database function is stricter on its own: a category passed with no valid values matches nothing. The app never sends one.

## How it is built

### Database (`supabase/migrations/20261114090000_directory_filters.sql`)

- **New columns:** the four columns above, with comments.
- **Partial indexes:** `heritage_objects_published_{accommodation,catering,event_facilities}_idx` on `(name_lv, id) WHERE status = 'published' AND offers_x IS TRUE`. The predicate is written `IS TRUE` exactly as the function writes it; with a plain `offers_x` predicate the planner ignored the index (measured).
- **Region options:** `public_directory_municipalities()` returns `(municipality, object_count)` for published objects. It is `SECURITY INVOKER`, so it runs under RLS like every public read.
- **Matching helper:** `private.search_published_object_keys(...)`, an ids-only `SECURITY DEFINER` helper, now takes the filters. As on Day 16, under RLS PostgreSQL will not use an index for a non-leakproof operator (`LIKE`, `enum_eq`) before applying the policy condition. The helper therefore returns ids only, for `status = 'published'`, with `ROWS 50` and `plan_cache_mode = force_custom_plan`.
- **Public function:** `search_public_heritage_objects(search_query, object_types text[], municipalities text[], access_types text[], accommodation boolean, catering boolean, event_facilities boolean, after_name, after_id, page_size)`.
  - It is `SECURITY INVOKER` and joins back to `heritage_objects` under RLS.
  - It bounds its input: at most 50 array values, municipalities of at most 120 characters, and `page_size` clamped to 1–50.
  - With neither a search term nor a filter it returns nothing; the plain directory keeps its Day 13 path.

### Application

- **`src/lib/directory/filters.ts`:** the URL model.
  - Parsing, validation and canonical ordering.
  - Region limits: at most 10 regions of at most 120 characters each.
  - `buildListingHref`, and `listingScope`, which fingerprints the search and filters for cursors.
- **`src/lib/directory/search.ts`:** `fetchListingPage` makes one call with the search and all filters, and refuses a cursor from any other listing.
- **`src/lib/directory/supabaseSearchDataSource.ts`:** bound RPC arguments, with `null` for an empty category.
- **`src/lib/directory/regionOptions.ts`:** loads the region options once per full page load, in the layout, capped at 500. A failure shows "Novadu saraksts šobrīd nav pieejams" instead of breaking the page.
- **`src/app/objects/(directory)/page.tsx`:** filtered and searched results, the invalid-value notice, and a filter-specific no-results state with "Notīrīt filtrus, paturēt meklēšanu".
- **`src/components/DirectoryFilterPanel.tsx`:** the panel (below).
- **`src/components/DirectorySearchField.tsx`:** a new search keeps the active filters and drops the cursor.
- **`src/lib/directory/links.ts` and `src/app/objects/[slug]/page.tsx`:** object pages carry `fromFilters`, so "back to the directory" returns to the same page of the same filtered results.

### URL model and cursors

Example: `/objects?q=pils&type=palace_or_castle&region=Bauskas%20novads&access=open&service=catering&cursor=…`

- **Repeated keys, canonical order:**
  - type, access and service follow enum order;
  - regions are sorted by code point, so equivalent selections give the same URL;
  - blank values are ignored.
- **Bounds:** at most 10 regions; `q` stays capped as on Day 16; the browser never receives more than one page of objects.
- **Cursor scope:** a cursor carries a `scope` fingerprint of its listing (search + canonical filters). A cursor from another search or filter set, or a plain-directory cursor, is refused. Page 1 is shown with "Saite uz šo lapu bija nederīga — rādīta pirmā lapa."
- **Cursor reset:** any filter or search change navigates without `cursor`. "Nākamā lapa" keeps every selection.

## Interface

- **Placement:** "Filtri (n)" is a `<details>` panel under the search field, in the shared layout, so it keeps its state while results load. It is **closed by default, even with filters active**. On a 360 px phone an open panel pushed every result below the first two screens; the chips show what is applied instead.
- **Groups:** four labelled `<fieldset>` groups with checkboxes.
  - Region uses a labelled "Pievienot novadu" select listing "name (count)". The chosen regions appear as chips.
  - An "OR within a group, AND between groups" hint sits above the groups.
  - The access group says that access is unrelated to ownership.
  - The services group says a service must be recorded, and that all ticked services are required.
- **Applying changes:** every change applies at once. Navigations run in a React transition, so the newest choice wins and a slower older response cannot overwrite it. "Atlasa…" is announced in a polite live region.
- **Active filters and clearing:**
  - each chip removes one filter ("Noņemt filtru: …");
  - "Notīrīt filtrus (paturēt meklēšanu)" clears filters and keeps the search;
  - "Notīrīt meklēšanu un filtrus" clears both.
- **Without JavaScript:** a GET form with a "Rādīt rezultātus" button.
- **Styling:** existing tokens only, with a 3 px accent focus outline on the summary, checkboxes, select, chips and buttons.

Screenshots (local fixture data, see "Verification") are in `docs/day17-screenshots/`:

- `filters-desktop-open.jpg` and `filters-desktop-results.jpg` (1280 px);
- `filters-mobile-results.jpg`, `filters-mobile-open.jpg` and `filters-mobile-no-results.jpg` (360 px).

## Performance

All numbers come from a disposable local PostgreSQL 16 database, called as `anon`, with a median of 21 calls per case. **Nothing was measured on Supabase.**

The test data was the realistic 902-object seed plus local-only fixture service and access values, multiplied to scale. Fixture flags exist only on the original 902 rows, so service data is sparse, which is the realistic early state.

The final migration was applied fresh, then `VACUUM ANALYZE` was run on **10,632 published rows**. That gives 174 accommodation rows and 88 event-facility rows.

| Case (one 25-row page)              | Median  | Max                  |
| ----------------------------------- | ------- | -------------------- |
| type castle                         | 0.99 ms | 8.02 ms (first call) |
| type castle OR ruin                 | 0.62 ms | 0.66 ms              |
| region Krāslavas novads             | 0.32 ms | 0.64 ms              |
| access open                         | 0.59 ms | 0.80 ms              |
| accommodation                       | 0.21 ms | 0.28 ms              |
| event facilities                    | 0.20 ms | 0.24 ms              |
| accommodation AND catering          | 0.34 ms | 0.46 ms              |
| type AND access AND catering        | 0.44 ms | 0.56 ms              |
| search "muiza" + accommodation      | 0.22 ms | 0.30 ms              |
| search "timanu" + type              | 0.25 ms | 0.40 ms              |
| no match (unknown region)           | 0.21 ms | 0.93 ms              |
| region options (109 municipalities) | 3.56 ms | 5.18 ms              |

- **Without the service indexes** (measured earlier on 10,835 rows), a sparse service filter was a sequential scan of every published row: 1.1–2.1 ms per page, growing linearly. That measurement is the reason for the three partial indexes, which are 16–40 kB each.
- **Plans:** type and region use the Day 9 B-tree indexes; for example, region is a bitmap scan on `heritage_objects_municipality_idx` reading 96 rows. Access walks the Day 16 partial `(name_lv, id)` index. Event facilities is an index-only scan on its partial index, at 0.07 ms.
- **Region options** aggregate every published row once per full page load (not per filter change, because they are loaded in the layout). At 10,000+ rows this is ~4–5 ms. If it ever matters, cache it with `unstable_cache` / revalidation; it was not added on speculation.

## Decisions requiring Codex review

1. **Services schema.** Three nullable booleans plus `services_verified_at`, rather than an enum array or a `object_services` join table. This is the smallest shape that keeps unknown ≠ no. Event capacity is not modelled.
2. **Region = exact municipality.** Variants such as "Bauskas novads" and "Bauskas novads (Rundāles pagasts)" are separate options until the Day 11 municipality mapping normalises them. Planning regions (Kurzeme etc.) need that normalised list first.
3. **No parent inheritance** for any filter.
4. **Unknown URL values are dropped with a notice**, not rejected with a 400. A category with only invalid values therefore counts as not selected. The alternative, showing no results, would turn every stale link into an empty page.
5. **Every filtered listing goes through the search function**, with the same ids-only `SECURITY DEFINER` pattern Codex accepted on Day 16, extended with filter arguments. The function signature changes, so the migration and the code deploy together.
6. **Three partial indexes**, justified by the sparse-data measurement above.
7. **Panel closed by default**, with chips as the visible summary.
8. **Region options loaded once per full page load** in the layout, uncached.
9. **Labels need copy review:** "Naktsmītnes", "Ēdināšana", "Pasākumu rīkošana", the group names and hints. This is this session's own wording, like the earlier labels.

## Verification

- **Quality gate:** `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` passed, as did typecheck after the build. `npm audit --omit=dev` found 0 vulnerabilities.
  - Tests: 38 files, 379 tests (322 → 379).
  - The gate ran on Node 22.23.4; the repo asks for ≥ 24, and npm only warns.
- **Unit and component tests:**
  - each filter on its own;
  - OR within a group and AND across groups;
  - independent services;
  - unknown and `NULL` values (the page test's fake source mirrors the database rules);
  - invalid URL params (unknown values, blank values, too many or too-long regions, repeated `q`);
  - search combined with filters, and a new search keeping filters;
  - pagination reset on filter change, the next link keeping selections with a scoped cursor, and a full 35-row walk;
  - stale and foreign cursors refused;
  - chip removal, clearing filters while keeping the search, and clearing everything;
  - the no-results clear link;
  - `fromFilters` on object links.
- **SQL against a local database (902 published realistic objects plus a draft):**
  - Every case was walked page by page as `anon` and equalled the ground truth: type 42; types OR 54; region 8; regions OR 17; access open 147; access OR 219; accommodation 179; catering 295; events 90; accommodation ∧ catering 61; type ∧ access ∧ catering 67; "muiza" + accommodation 166; "pils" + castle + region 1.
  - An unknown type alone gives 0; known + unknown gives 42. `NULL` and `false` services never matched, the draft never appeared, and `page_size` was clamped to 50.
- **Browser (Playwright, `next start` → local PostgREST 12.2.3 → local database): 27 of 27 checks passed.**
  - Each filter in the UI equals the database across all pages, with OR/AND behaviour and no `NULL` leaks. Search plus filters also equals the database, and a search keeps the filters.
  - Page 2 keeps the selections and survives a refresh with the same cards. A filter change drops the cursor.
  - Chip removal, "clear filters" (search kept) and "clear all" work, and Back/Forward restores the earlier listings.
  - "Atlasa…" is announced. A deliberately delayed older response (2.5 s proxy delay) never replaced the newer listing.
  - Invalid params show the notice.
  - The keyboard reaches the summary, checkboxes and chips, each with a visible 3 px outline.
  - The object page's back link returns to the same filtered page.
  - There is no horizontal overflow at 1280 px or 360 px.
- **Blocked or not done:**
  - nothing ran against the real Supabase project (no credentials in this session, and no migrations may be applied);
  - no measurement on Supabase hardware;
  - no real service or access data exists to verify the filters on.

## Known limitations

- Service and access filters return nothing on real data until those fields are recorded editorially.
- Municipality variants are separate region options until the municipality mapping is done; a "region" in the planning-region sense does not exist yet.
- Region options cost ~4–5 ms per full page load at ~10,000 rows, uncached.
- All verification data is local. The service and access values are deterministic fixtures, never committed.
- Event capacity, "not offered" filters and filter counts per option (other than region) are out of scope.
- Condition, ownership and historical-family filters are Day 18.
