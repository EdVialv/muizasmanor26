# Day 14 — individual heritage-object pages

This is the Day 14 deliverable from `TODO.md`: "Build `/objects/[slug]` detail pages with hierarchy, history, condition, ownership and services" (issue [#7](https://github.com/EdVialv/muizasmanor26/issues/7)).

- **Branch:** `claude/day14-object-pages`
- **Base:** `ebc4bca` on `main` — "Day 13: add reviewed public heritage directory (#38)", the merged, Codex-reviewed Day 13. Its pagination correction (next-only cursor URLs, no `back` history, 2,048-character token cap) is untouched.
- **No migration, no schema change, no new dependency.**

## What this delivers

- `src/app/objects/[slug]/page.tsx` — the object page, an async Server Component with `generateMetadata`.
- `src/app/objects/[slug]/ObjectRelationsSection.tsx` — parent, children and historical owner families; an async Server Component streamed in under `<Suspense>`.
- `src/app/objects/[slug]/not-found.tsx`, `error.tsx`, `loadObject.ts`, `objectMetadata.ts`.
- `src/lib/objects/detail.ts` — types, the `ObjectDetailDataSource` seam and the orchestration; no Supabase import.
- `src/lib/objects/supabaseDetailDataSource.ts` — the Supabase-backed implementation.
- `src/lib/supabase/publicClient.ts` — one shared factory for the anon-key client.
- `src/lib/directory/links.ts` — links that carry the visitor's place in the directory.
- `src/components/HeritageObjectCard.tsx` — now links with that directory context.
- `src/app/objects/(directory)/` — the Day 13 directory files, moved into a route group (see decision 1). The URL is still `/objects`; their contents are unchanged apart from passing the context to each card.
- `src/test-support/recordingSupabaseClient.ts` — a shared recording stub for data-source tests.

## What the page shows

Everything comes from the published `heritage_objects` row and its child tables. A value that is null or blank produces no row, no heading and no placeholder text.

| Shown                           | Source                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| Name, type                      | `name_lv`, `object_type` (label from `src/lib/directory/labels.ts`)                          |
| Location                        | `municipality`; coordinates from `latitude`/`longitude`                                      |
| Description                     | `summary_lv`, split into paragraphs on blank lines                                           |
| Condition                       | `condition_category` label and `condition_notes_lv`                                          |
| Ownership category              | `ownership_type` label                                                                       |
| Historical owners               | `object_historical_owner_families`, **verified rows only**, with approximate years           |
| Parent and children             | `parent_object_id`, both directions, **published objects only**                              |
| Page title and meta description | `name_lv`; `summary_lv` cut to 160 characters, or type + municipality if there is no summary |

The class A/B explanation ("an internal platform classification, not an official Latvian designation") is printed under the condition, as `docs/DATA_MODEL.md` requires of public pages.

**Not shown, because the schema has no field for it:** services (accommodation, catering, events), opening or access information, images, contacts, sources. Services have no column anywhere in the Day 8–10 migrations, so nothing is displayed for them. Images, sources, contacts and access information are Day 15.

## Decisions requiring Codex review

1. **The directory files moved into a `(directory)` route group, and the object page has no `loading.tsx`.** A `loading.tsx` wraps its whole segment — including child routes — in a Suspense boundary, and Next starts streaming as soon as that boundary can show its fallback. Once a response has started, its status cannot change, so `notFound()` would render "not found" under an HTTP 200. Day 13's `src/app/objects/loading.tsx` would have wrapped `/objects/[slug]` too. Moving it into `src/app/objects/(directory)/` scopes it to the directory, and the object page awaits its lookup with no Suspense boundary above it. Verified against a running server: unknown, malformed and unpublished slugs all return **404**. The cost is that the object page has no route-level loading screen; its loading state is the streamed relations section instead.
2. **Only `verified` historical owner families are displayed.** RLS lets anon read every family row of a published object, verified or not. `docs/DATA_MODEL.md` describes this relation as "verified noble houses, families or dynasties", so the page filters on `verification_status = 'verified'`. Alternate names (`object_names`) are not displayed at all on this page.
3. **A parent that is not published is treated as no parent.** The lookup returns nothing (RLS hides the row) and the page renders no "part of" group, so it never reveals that an unpublished object exists. A draft child is likewise absent from its parent's list.
4. **Coordinates are shown as plain decimal degrees** (5 decimals). No map — Day 19.
5. **Directory context is one token, not a history.** A card on a later directory page links to `/objects/<slug>?from=<cursor>`; the object page validates `from` with `decodeCursor()` and builds its back link to `/objects?cursor=<cursor>`. Links to related objects pass the same token on. It never grows, and an invalid value is dropped — the back link then goes to the first page.
6. **A failed lookup renders an error state under HTTP 200**, like the Day 13 directory. The App Router cannot set a 5xx status from a page; the two failure kinds (missing configuration, failed query) show a generic message and never the underlying error.
7. **Children are capped at 50** (ordered by name, then id) with a "first 50 shown" note. No real complex is that large; the cap exists so the request is always bounded.

## Public-data access

Same rule as Day 13: the anon/publishable-key client only, so the Day 9 RLS policies are the boundary; every query also filters `status = 'published'` itself. Each query names its columns — `source_system`, `external_source_id`, `status` and the audit timestamps are never selected (asserted in `supabaseDetailDataSource.test.ts`). The slug is validated against the importer's slug shape (`[a-z0-9]+(-[a-z0-9]+)*`, at most 200 characters) before any query; values reach PostgREST only through `.eq()`, never inside a filter string. The object page makes one request for the object, then at most three more in parallel (parent, children, families) — a fixed number, not one per child.

## Verification

Run on Node 22.23.4 (the repo requires Node ≥ 24; npm warns but everything runs — CI on Node 24 is the authoritative result).

- `npm run format:check` — passed.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm test` — passed: 23 files, **200 tests** (139 → 200).
- `npm run build` — passed; `/objects` and `/objects/[slug]` are dynamic, `/` is static.
- `npm audit --omit=dev` — 0 vulnerabilities.

**End-to-end, against a real PostgREST and real RLS.** No Supabase project is reachable from this session, so a disposable local stack stood in: PostgreSQL 16 + PostGIS with the three repository migrations applied unmodified, the `anon`/`authenticated`/`service_role` roles, and PostgREST 12.2.3 serving it under `/rest/v1`. It was seeded with the repository's 25-record sample plus the in-scope posts of the real workbook (902 published objects). `summary_lv` carried a `[Testa dati]` marker, since no Latvian summaries exist yet. Nothing was written to Supabase. With `next start` pointed at it, a Playwright run confirmed:

- directory page 1 → "Nākamā lapa" → page 2 → an object → "Atpakaļ uz katalogu" returns to the same page 2 URL with the same cards;
- Rundāles pils → its park (child) → back to Rundāles pils (parent), by the related-object links;
- the Rundāle stables, left as a `draft`, are not linked from the palace and their own URL returns 404;
- an unverified owner family is not shown; verified ones are;
- `/objects/no-such-object`, `/objects/Bad_Slug!` → HTTP 404 with the not-found page;
- no horizontal overflow at 360 px or 1280 px.

**Not verified:** anything against the real `muizasmanor26-dev` project, which has no published object yet.

## Known limitations

- **No published object exists in the real project**, so `/objects/<slug>` 404s for every slug there until an editor publishes one.
- **"Objekti" is not highlighted in the header on an object page.** `SiteHeader` marks an item current only on an exact path match, and its Day 13 test asserts that for a detail route. Left as is.
- **Owner-family order follows the database collation.** Rows are sorted by start year, then name; with the `C` collation of the local test database, "Zubov" sorts before "von Biron".
- **The streamed relations section replaces its placeholder after first paint**, so the Day 13 note about a one-time focus reset during a Suspense swap applies here too.
