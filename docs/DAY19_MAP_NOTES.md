# Day 19 — interactive heritage-object map

The Day 19 deliverable from `TODO.md`: "Integrate Leaflet with production tiles, viewport queries, clustering and list-to-map navigation" (issue [#9](https://github.com/EdVialv/muizasmanor26/issues/9)).

## Baseline

The work is built on `claude/day18-condition-ownership-family` at `8e92f7c`.

When this session started, nothing from Days 17–18 had been accepted. `main` on GitHub was still `f3311e7`, and the remote had no Day 17/18 branch or pull request. `8e92f7c` is the corrected Day 18. It contains the corrected Day 17: shared listing state, the no-JavaScript forms that keep filters, out-of-order navigation handling (`d024b06`, `ec95a0d`, `1a4c3ea`), and the Next 16.4.6 bump (`c7121c5`). If Codex changes Days 17–18 in review, this branch needs a rebase.

`AGENTS.md` does not exist in the repository.

Full shareable map-position URLs are Day 20 work. Routing, geolocation, booking, payments, admin editing and redesign are out of scope.

## Deployment requirement

**Apply `supabase/migrations/20261116090000_directory_map.sql` after the Day 15–18 migrations, then deploy the Day 19 code.**

Nothing has been applied anywhere. The migration:

- adds functions, one composite type and one index;
- changes no table and no data;
- keeps every public signature: `search_public_heritage_objects` keeps its Day 18 signature and behaviour, and only its body now calls the shared pieces.

Day 18 code therefore keeps working once the migration is applied. `/map` needs it.

## Tiles

Leaflet draws the map; the tiles come from a separately configured provider. The tile settings are **server environment variables**, read when the page renders and passed to the browser. They are documented in `.env.example`, and no key is committed.

| Variable               | Meaning                                                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MAP_TILE_URL`         | An https XYZ template containing `{z}`, `{x}` and `{y}`; `{s}` and `{r}` are also allowed. A key in it is visible to browsers, so use one restricted to the site's domain. |
| `MAP_TILE_ATTRIBUTION` | Required whenever `MAP_TILE_URL` is set. It is shown in the map's attribution control, next to "Leaflet".                                                                  |
| `MAP_TILE_MAX_ZOOM`    | Optional, 1–22. The default is 19.                                                                                                                                         |

`src/lib/map/tileConfig.ts` handles the cases:

- **Configured:** the given provider is used. An insecure, incomplete or attribution-less configuration counts as invalid.
- **Not configured, outside production:** the OpenStreetMap Foundation's standard tiles (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`) are used, with "© OpenStreetMap contributors". The [OSMF Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) allows this subject to its rules:
  - clear attribution;
  - a valid Referer (browsers send one, and the app sets no restrictive Referrer-Policy);
  - honouring caching;
  - no bulk, prefetch or offline download (the map loads only the visible tiles).

  The policy also says capacity is limited, there is no SLA, and access may be withdrawn. `docs/ARCHITECTURE.md` already rules this server out as a production back end.

- **Not configured (or invalid) in production:** there is no base map. Objects still show on a plain background with the notice "Pamatkarte nav pieejama…", until a provider is chosen.

**No paid service was enabled.** Choosing the production provider is the owner's decision, because the free plans' terms depend on who operates the site:

| Provider                                            | Free plan (checked 2026-11-18)                                                                                                                                                                                                                                                                                    | Setup                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Stadia Maps](https://stadiamaps.com/pricing/)      | 200,000 credits a month; one raster tile costs 1 credit. Non-commercial use only, by an individual or a non-profit; a for-profit organisation counts as commercial even without revenue ([FAQ](https://stadiamaps.com/faqs/)). Over the limit, requests fail until the next month; there is no automatic billing. | Domain-based authentication with no key in the URL ([raster docs](https://docs.stadiamaps.com/raster)). `MAP_TILE_URL=https://tiles.stadiamaps.com/tiles/<style>/{z}/{x}/{y}{r}.png` (an EU endpoint also exists). Attribution: "© Stadia Maps © OpenMapTiles © OpenStreetMap contributors". |
| [MapTiler](https://www.maptiler.com/cloud/pricing/) | 100k requests a month, described as "personal, or non-commercial use". The service pauses at the limit. The MapTiler logo is required on the free plan.                                                                                                                                                           | API key in the URL; restrict it to the site's origin.                                                                                                                                                                                                                                        |

The map was tested only with a stand-in tile server (see "Verification"). No real provider was contacted.

## Spatial schema and coordinate validity

- **Existing schema (Days 8–9):**
  - `latitude` and `longitude` are `numeric NOT NULL`, with range checks of ±90 and ±180;
  - `location` is a `geography(Point, 4326)` column generated from them;
  - a GiST index on `location` already exists.

  A published object therefore cannot lack coordinates, and its location cannot disagree with them.

- **Valid map location:** `docs/DATA_MODEL.md` says "Do not publish coordinates outside Latvia". The map shows only points inside a fixed **Latvia box: latitude 55.60–58.15, longitude 20.90–28.30**. That is Latvia's extent plus a small margin, with edges included. It is defined once in SQL (`public_map_objects`) and once in TypeScript (`LATVIA_BOUNDS` in `src/lib/map/viewport.ts`).
  - A point outside the box, such as a foreign location or (0, 0), is an invalid map location. It is never drawn and never repaired, and it stays in the list.
  - A valid point that is just outside the current viewport is a different case: it appears as soon as the visitor pans to it.
  - The map's note says "Kartē ir tikai objekti ar derīgām koordinātām Latvijā" and links to the full list.
- **Identical positions are kept.** Several objects at exactly the same position are shown as one marker with a count, and selecting it lists them all.

## Spatial queries and response limits

### One set of matching rules for the list and the map

The migration moves the Day 16–18 rules into two shared functions:

- `private.parse_directory_filters()`: search terms, enum validation, ownership groups, canonical family names, bounds, and "given but unusable means match nothing".
- `private.published_objects_matching()`: every matching predicate. It is an inlinable SQL set-returning function: not `SECURITY DEFINER`, no `SET` clause, and every reference schema-qualified.

The list helper (`private.search_published_object_keys`) and both map helpers select from the same matcher. The planner inlines it into each caller, so the list still uses the same indexes; this was checked with `EXPLAIN` and re-timed below.

Unused search-term slots (`'%'`) now fold away instead of reading `search_document` for every row. Results are identical, and an unsearched map no longer reads that column.

In the application, `listingRpcArgs()` builds the search-and-filter arguments for both RPCs, and the map route reads its parameters with the directory's own `parseListing()`.

### `public_map_objects(west, south, east, north, zoom, …listing arguments)`

This function is `SECURITY INVOKER`.

1. **Validate the viewport.** NaN, NULL, ±∞, a reversed or empty rectangle, or anything outside ±90/±180 returns no rows. The rectangle is then clamped to the Latvia box; one that cannot overlap Latvia returns no rows.
2. **Parse the search and filters with the shared parser.** Unlike the list, no search and no filter means "everything in view".
3. **Find the ids.** `private.map_published_object_keys(…)`, a `SECURITY DEFINER` helper that returns ids only, collects at most **501** ids of matching published objects in the rectangle. Its rectangle test is `geometry(location) && ST_MakeEnvelope(…)`, an exact longitude/latitude rectangle, which is what Leaflet shows. Small viewports use the new partial GiST index `heritage_objects_published_location_geometry_idx`. Large ones use a plain range test, explained below.
4. **At most 500 matches:** one `object` row each (id, slug, name, type, position), re-read under RLS, in directory order.
5. **More than 500 matches:** grid clusters from `private.map_published_clusters(…)`.
   - The helper is `SECURITY DEFINER` and returns aggregates of published rows only.
   - Each non-empty cell gives its mean position, extent and **exact count**.
   - Cells are about 64 screen pixels at the requested zoom, and never smaller than 1/32 of the viewport, so there are at most 32 × 32.
   - A cell holding a single object is returned as that object, re-read under RLS.
   - The sum of the counts is always the exact number of matches. **A truncated set of points is never returned.**

`GET /api/directory/map?bbox=west,south,east,north&zoom=z&<listing parameters>` (`src/app/api/directory/map/route.ts`):

- validates the viewport strictly: exactly four plain decimals and one integer zoom; anything else returns 400;
- ignores `cursor`;
- returns `{mode, objects, clusters, total}` with `Cache-Control: public, max-age=30`;
- on failure returns 503 or 502 with a generic body.

The browser also drops any row outside the valid map area as a second line of defence.

## Interface

- **Routes and navigation:**
  - `/map`, as ARCHITECTURE.md specifies, is linked from the site header ("Karte").
  - Both views share one frame (`src/components/DirectoryFrame.tsx`): heading, a **Saraksts / Karte** switch, the search field and the filter panel, all inside **one `DirectoryListingProvider`** with the view.
  - The switch links carry the latest intended search and filters, including a change still in flight, and never a cursor.
  - The map reads the same shared listing and never navigates itself, so it cannot reintroduce the Day 17 races.
- **Map** (`src/components/map/LeafletMap.tsx`), loaded with `next/dynamic` and `ssr: false`:
  - It opens on Latvia.
  - Single objects are drawn on canvas, with no DOM marker each.
  - Clusters and same-position stacks are a few DOM count markers.
  - Up to 500 objects are clustered on the client with **Supercluster 9.1.0**, which is maintained. Selecting a cluster zooms to where it splits. A cluster that can never split, or a same-position stack, opens a list popup instead.
  - Server clusters zoom to their extent.
  - The popup shows the name, the type and a link to `/objects/[slug]`. It is built from DOM nodes, never parsed as HTML.
  - Popups are opened on the map, not bound to markers. A popup's own auto-pan redraws the markers, and on phones a bound popup closed itself.
- **Fetching** (`useMapData`):
  - waits 300 ms after the last viewport or listing change;
  - aborts the previous request and ignores any answer that is not the newest;
  - sends no requests while the page is hidden, and catches up when it is shown again;
  - keeps the previous result visible while loading or after an error.
- **Status and states:**
  - loading ("Ielādē objektus…" / "Atjauno…");
  - exact count in view, plus "apvienoti grupās — tuviniet…" when clustered;
  - no results, worded differently with and without filters;
  - request error with "Mēģināt vēlreiz";
  - tile failure: after four failed tiles and none loaded, "Kartes fona attēlus neizdevās ielādēt…" while objects stay;
  - no base map configured;
  - Leaflet code failing to load: "Karti neizdevās ielādēt…", with the controls and the list link still working;
  - no JavaScript: a `<noscript>` link to the same search and filters as a list.
- **Keeping view and list apart:** "Šajā kartes skatā: N objekti" counts only the viewport. A separate link, "Visi atlasītie objekti sarakstā", opens the full filtered list.
- **Accessible list alternative:** "Objekti šajā kartes skatā" lists every object in view as a link, in name order. When the view is clustered, it says there are too many to list and points to zooming or the list.
- **Keyboard and scrolling:**
  - The map container is focusable with a visible 3 px outline. The arrow keys pan and +/− zoom; the zoom buttons are focusable.
  - Markers are **not** Tab stops, so a dense view cannot put hundreds of stops between the map and the rest of the page. The list above gives keyboard access to every object in view.
  - The scroll wheel zooms only after the map is clicked or focused, and stops when the pointer leaves or focus moves on, so the page scrolls past the map.
- **Attribution:** "Leaflet | <provider>" in 12 px text on a light background. It wraps instead of being cut off, and stayed fully on screen at 360 px.
- **Object page:** links from the map carry `fromView=map` with the search and filters. The object page's back link then reads "Atpakaļ uz karti" and returns to `/map` with the same selection, but not the same position (Day 20).

## Performance

These figures are local only: PostgreSQL 16 + PostGIS 3.4, with all eight migrations freshly applied, then `VACUUM ANALYZE`. Calls ran as `anon`, and each figure is the median of 21. **Nothing was measured on Supabase.** The data was **10,643 published objects**: the 886 realistic objects scaled up, with every copy at its original's position, so many positions repeat.

| Case                                                      | Rows returned (objects) | Median             |
| --------------------------------------------------------- | ----------------------- | ------------------ |
| whole Latvia, z7, no filter                               | 31 clusters (10,643)    | 21.4 ms            |
| whole Latvia, z7, condition unknown                       | 27 clusters (6,336)     | 14.1 ms            |
| whole Latvia, z7, search "muiza"                          | 31 clusters (9,828)     | 21.6 ms            |
| whole Latvia, z7, type castle                             | 384 points              | 2.1 ms             |
| Rīga area, z11, no filter                                 | 28 clusters (768)       | 2.6 ms             |
| Rīga, z11, "muiza" + castle                               | 24 points               | 0.8 ms             |
| a town, z14                                               | 12 points               | 0.3 ms             |
| empty area                                                | 0                       | 0.3 ms             |
| list: type castle / "muiza" + accommodation / condition A | 25 rows each            | 0.7 / 0.4 / 0.3 ms |

- **List performance is unchanged.** Its timings match Day 18, which confirms the shared matcher is inlined.
- **Spatial index.** The new partial GiST expression index serves small and medium viewports. PostGIS estimates one row for any rectangle on it, so for a viewport covering more than a quarter of the Latvia box the planner would walk the index across thousands of rows (12 ms of the whole-Latvia call). `public_map_objects` therefore switches those to a plain range test. Each call's custom plan folds away the unused test.
- **Whole-Latvia unfiltered view, about 20 ms.** This is dominated by aggregating all 10,643 rows: a raw scan alone took about 8 ms on this machine. Repeats are absorbed by the 30 s HTTP cache.
  - Two improvements were measured and kept: skipping the order of a >500 id set (−7 ms), and re-reading single-object cells by index instead of hashing every published row.
  - A covering `(longitude, latitude)` index was tried and dropped: no gain. Aggregating in `double precision` instead of `numeric` was kept, though it made no measurable difference.

## Decisions requiring Codex review

1. **Shared matcher.** The Day 16–18 rules moved into an inlinable `private.published_objects_matching()` and a shared parser; the list function bodies were replaced, with the same signatures. The matcher has no `SET search_path` (that would stop inlining), but every reference is schema-qualified; Supabase's advisor may still list it.
2. **Valid map locations** are the Latvia box, edges included. Objects outside it stay listed and are never moved.
3. **Exact rectangle matching** on `geometry(location)`, with a new partial GiST index, and a plain range test for viewports over 25 % of Latvia.
4. **Response bound:** all points up to 500, otherwise exact grid clusters. The cluster helper is `SECURITY DEFINER` and returns aggregates of published rows; single objects are re-read under RLS.
5. **Tiles:** server-side environment configuration; the OSM standard tiles in development only; production has no base map until a provider is chosen. No paid plan was enabled.
6. **Client clustering** with Supercluster 9.1.0, and same-position stacks.
7. **Markers are not Tab stops.** Keyboard access is the map keys plus the in-view list.
8. **One frame** for `/objects` and `/map`, with the view inside the shared provider. A "Karte" header link.
9. **`fromView=map`** on object links, with "Atpakaļ uz karti".
10. **New dependencies:** `leaflet` 1.9.4, `supercluster` 9.1.0, and `@types/leaflet` 1.9.22 as a dev dependency. `npm audit --omit=dev` reports 0 vulnerabilities.

## Verification

- **Quality gate:** `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test -- --run`, `npm run build`, `npm audit --omit=dev` (0) and `git diff --check` all passed.
  - 49 test files, 503 tests (462 → 503).
  - The gate ran on Node 22.23.4; the repo asks for ≥ 24, and npm only warns.
- **Unit and component tests:**
  - viewport validation, clamping, rounding and malformed parameters;
  - tile configuration;
  - Supercluster stacks and counts;
  - map results: exact totals, dropped invalid rows, same arguments as the list;
  - the map route: 400s, list-identical parsing, cursor ignored, generic errors;
  - `useMapData`: debounce, abort and stale answers, hidden page, error and retry;
  - the map inside the real provider, search field and panel:
    - URL selection;
    - a filter change used while its navigation is in flight;
    - rapid search, filter and viewport changes costing one request with the newest combination;
    - a stale answer ignored;
    - clustered, no-results, error, missing-tiles and tile-failure states;
    - list and switch links keeping the selection;
  - the object page's back link to the map, and `fromView` parsing.
- **SQL:**
  - `supabase/tests/directory_map.test.sql` (new; rolled back; run on a disposable local database) passed. It covers:
    - 520 matches giving clusters totalling 520, all inside the viewport;
    - a filter narrowing them to 100 points;
    - map points equal to the list's results inside the viewport, for five search and filter combinations including Day 18 "unknown";
    - identical positions;
    - inclusive edges;
    - outside-Latvia, (0, 0) and draft objects never on the map, with the outside object still listed;
    - invalid viewports returning nothing.
  - `supabase/tests/directory_family_names.test.sql` passed again.
  - The re-run list ground-truth walks passed: Day 17 16/16 and Day 18 23/23. The Day 16 search checks matched as before.
- **Browser:** **22 of 22** checks passed. These ran Playwright against the production build, the local PostgREST and the local database, with stand-in tiles.
  - Loading, tiles and attribution.
  - Whole-Latvia exact clustered total, and a cluster click zooming in with an exact total.
  - The type filter and Day 18 "not recorded" equalling the database. Map objects were identical to the list's objects for the same selection.
  - Identical positions forming one stack. Its popup listed both, and object page → "Atpakaļ uz karti" kept the search.
  - A single object's canvas popup (name, type, link).
  - Outside Latvia and (0, 0) not on the map but listed.
  - A slow older search never replacing a newer one.
  - Six quick pans costing one request.
  - Keyboard: focus ring, "+" zooming, Tab moving past the map.
  - The wheel over an untouched map scrolling the page.
  - List → map keeping the selection without a cursor.
  - No requests while hidden.
  - Tile failure, a blocked Leaflet chunk and no JavaScript.
  - At 360 px: no overflow, attribution on screen, and an auto-panning popup staying open.
- **Regressions on the shared frame:** the Day 17 (27/27, 19/19) and Day 18 (27/27, 6/6) browser runs passed again.
- **Screenshots:** `docs/day19-screenshots/`, with a stand-in base map labelled "testa pamatkarte". The objects are the realistic local seed plus the identical-position fixtures.
  - `map-desktop-latvia-clusters.jpg`, `map-desktop-riga.jpg` and `map-desktop-same-position-popup.jpg`;
  - `map-mobile-riga.jpg`, `map-mobile-same-position-popup.jpg` and `map-mobile-status-and-list.jpg`.

### Blocked or not verified

- No real tile provider was contacted. Tiles came from a stand-in served by the test browser, so real-provider attribution, rate limits and styling are unverified.
- Nothing ran against the real Supabase project: no credentials, and migrations may not be applied. PostGIS behaviour and timings on Supabase are unverified.
- The map was tested in Chromium (Playwright) only, not on real phones or other browsers.

## Known limitations

- Map position is not in the URL, so refresh and Back reopen Latvia. This is Day 20.
- Changing the search or filters does not move the map to the results.
- Grid clusters at wide zoom snap to a fixed grid and can look regular. Their counts are exact.
- The whole-Latvia unfiltered view costs about 20 ms per uncached request at 10,000 objects locally.
- `supabase/tests/*.sql` has no automated runner or CI job yet.
- Map and list wording ("Karte", "Saraksts", statuses, notices) needs a copy review.
