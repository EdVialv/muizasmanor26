# Day 13 — heritage-object cards and the cursor-paginated public directory

This is the Day 13 deliverable from `TODO.md`: "Build cards and a
cursor-paginated server-side directory with loading, empty and error
states" (issue [#7](https://github.com/EdVialv/muizasmanor26/issues/7)).
Built on top of Day 12's design tokens and `AppShell`/`SiteHeader` shell. No
Day 11 or Day 12 work is repeated here, and Day 14 (object detail pages
beyond the `/objects/[slug]` link target) is explicitly out of scope.

## What this delivers

- `src/app/objects/page.tsx` — the public directory at `/objects`, an async
  Next.js Server Component.
- `src/app/objects/loading.tsx` — the route's loading state, rendered
  automatically by the App Router's implicit Suspense boundary while the
  page's data fetch is in flight.
- `src/app/objects/error.tsx` — a Client Component error boundary for
  exceptions that escape the page's own try/catch.
- `src/components/HeritageObjectCard.tsx` — the reusable card, plus
  `src/lib/directory/labels.ts` for the Latvian enum-to-label mapping it
  uses.
- `src/lib/directory/cursor.ts` — cursor encoding,
  decoding and validation; pure functions, no I/O.
- `src/lib/directory/queries.ts` — the pagination orchestration
  (`fetchDirectoryPage`) and the `DirectoryDataSource` seam it depends on;
  no Supabase import here at all.
- `src/lib/directory/supabaseDataSource.ts` — the one module that actually
  talks to Supabase, implementing `DirectoryDataSource`.
- `src/components/SiteHeader.tsx` — converted from a Day 12 server component
  with a hardcoded "Sākums"/`aria-current` to a client component computing
  the current nav item from `usePathname()`, now that a second route
  (`/objects`) exists; adds the "Objekti" link.
- 44 net new tests across 5 files (`cursor.test.ts`, `queries.test.ts`,
  `supabaseDataSource.test.ts`, `HeritageObjectCard.test.tsx`,
  `objects/page.test.tsx`), plus `SiteHeader.test.tsx` rewritten for the new
  per-route `aria-current` behaviour and one added mock in
  `AppShell.test.tsx`. Test count: 95 → 139 after review.
- `@supabase/supabase-js` added as a new dependency (no other new runtime
  dependency).

## Route and component structure

`ObjectsPage` (the default export of `src/app/objects/page.tsx`) is
deliberately thin: it decodes/validates the URL cursor, calls one
`loadPage()` helper that wraps
`createDirectoryDataSourceFromEnv()` + `fetchDirectoryPage()` in a
try/catch, and renders one of five states from the result (invalid-cursor
notice + normal results, empty, configuration error, query error, or - via
Next's own mechanism, not this file - the loading skeleton). All of the
logic that can be meaningfully unit-tested without a live Supabase project
lives outside this file:

- `src/lib/directory/cursor.ts` is pure - encode/decode/validate a single
  cursor and build the bounded query params for the "next" link. No React,
  no I/O.
- `src/lib/directory/queries.ts` defines `DirectoryDataSource` (three
  methods: `fetchFirstPage`, `fetchSameNameAfterId`, `fetchAfterName`) and
  `fetchDirectoryPage()`, which contains all the pagination orchestration
  (over-fetch by one row, detect `hasNextPage`, build the next cursor from
  the last row, map to the presentation shape). It takes a
  `DirectoryDataSource` as a parameter, so tests exercise it against an
  in-memory fake instead of a live project.
- `src/lib/directory/supabaseDataSource.ts` is the only file that imports
  `@supabase/supabase-js`. `createSupabaseDirectoryDataSource(client)`
  builds a `DirectoryDataSource` from an already-constructed client (tested
  directly against a recording stub client, not a live one);
  `createDirectoryDataSourceFromEnv()` is the thin production wrapper that
  reads environment variables and throws `DirectoryConfigurationError` if
  either is missing.

`HeritageObjectCard` is a presentation-only component: it takes a
`DirectoryObjectSummary` and renders what it has, omitting anything null.

## Cursor format and ordering

The directory orders published objects by `name_lv` ascending, then `id`
ascending as a tie-breaker - a usable alphabetical listing with a fully
deterministic order even when two objects share a name. A cursor is the
`(name_lv, id)` pair of the last row on the previous page: "give me rows
strictly after this pair," i.e. keyset/seek pagination, not `OFFSET`, so
the query cost does not grow with how deep into the catalogue a page is -
required for the 5,000-10,000-object scale target.

The cursor travels in the URL as an opaque token:
`base64url(JSON.stringify({ name, id }))`. It is validated on every decode

- well-formed base64url, valid JSON, exactly the two expected keys, `id`
  matching a UUID pattern, `name` a non-empty string under 500 characters -
  and any failure returns `null` rather than throwing. `ObjectsPage` treats a
  `null` decode exactly like "no cursor" (the first page), and shows a small
  inline notice ("Saite uz šo lapu bija nederīga — rādīta pirmā lapa.")
  rather than erroring. This satisfies the brief's "validate the cursor
  before using it; an invalid or tampered cursor must fail safely."

**Codex review correction — bounded URL state.** Claude's first version
implemented a "Previous" link by appending every earlier cursor to a `back`
URL parameter. That works on shallow pages, but its URL grows linearly with
page depth and could become tens of kilobytes across a 5,000-object
catalogue. It also expanded the amount of untrusted text decoded on every
request. The reviewed version therefore keeps only the current `cursor` in
the URL and relies on the browser's Back action for reverse navigation.
This preserves safe, refreshable keyset pagination without an unbounded
history parameter. `decodeCursor` now rejects encoded tokens longer than
2,048 characters before allocating a decode Buffer, in addition to its
existing decoded-shape limits. A future explicit "Previous page" control
should use a reverse keyset query, not reintroduce an accumulating URL
history.

### Why the keyset boundary is two queries, not one composite filter

A single PostgREST request cannot safely express "rows after this
`(name_lv, id)` pair" as one filter without building a composite
`or()`/`and()` filter string and manually quoting `name_lv`'s content -
real titles in this dataset contain commas and parentheses (e.g.
`"Rundāles pils (ziemeļu spārns)"`), which are structurally significant in
PostgREST's filter grammar. Hand-rolling that escaping is exactly the kind
of "becoming raw SQL"-shaped risk the Day 13 brief warns the cursor
handling must avoid, and it was not possible to verify against a live
PostgREST endpoint from this session (no reachable Supabase project; see
below).

Instead, `fetchDirectoryPage` issues up to two simple, single-column
filtered requests - `.eq()`/`.gt()` calls that supabase-js sends as
ordinary, individually-encoded query parameters, with no string
interpolation of untrusted values at all:

1. rows with `name_lv` exactly equal to the cursor's name and `id` greater
   than the cursor's id (the remainder of the cursor's own name group),
   ordered by `id`;
2. rows with `name_lv` strictly greater than the cursor's name, ordered by
   `(name_lv, id)`, limited to whatever count remains after (1).

Concatenating (1) then (2) reproduces the same order a single
`(name_lv, id) > (cursorName, cursorId)` condition would give. The cost is
up to one extra small round trip per page past the first. This is verified
two ways: `queries.test.ts` exercises the exact boundary-crossing scenario
(two rows sharing a name, cursor pointing at the first) against an
in-memory fake, and `supabaseDataSource.test.ts` asserts the real
implementation passes a name containing commas/parentheses/quotes straight
through as a plain filter argument, never into a string it would have to
escape.

## Public-data / RLS assumptions

`createSupabaseDirectoryDataSource` deliberately uses the public
anon/publishable-key client (`@supabase/supabase-js`, talking to
PostgREST), never a direct Postgres connection string. Scripts under
`scripts/import/` (the Day 10/11 importer) use `pg` directly against
`SUPABASE_DB_URL`, which Supabase's direct connection string runs as a
privileged role that **bypasses Row Level Security** - appropriate for a
batch import tool with no public-facing exposure, wrong for a public route.
Querying through the anon-key client means the Day 9 migration's
`heritage_objects_select_published` RLS policy (`status = 'published'`,
granted to `anon`/`authenticated`) is the real boundary; this route's own
`.eq("status", "published")` filters are defence in depth on top of that,
not the only thing standing between `/objects` and a draft record. No RLS
policy, grant or schema was changed - Day 13 only reads through the
boundary Day 9 already built.

## Handling of missing environment variables

This session has no reachable Supabase project (no `.env.local`, as in
every prior day). `createDirectoryDataSourceFromEnv()` throws
`DirectoryConfigurationError` when `NEXT_PUBLIC_SUPABASE_URL` or
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is absent, and `ObjectsPage` renders
a generic "Katalogs nav pieejams" (catalogue not available) state for it -
the same safe, non-leaking treatment as any other data-source failure (see
"Verification" below for confirmation nothing from that error message
reaches rendered HTML). Production code never substitutes fake or
placeholder records for a missing configuration.

Every test that exercises `ObjectsPage` or `fetchDirectoryPage` injects a
`DirectoryDataSource` directly - either an in-memory fake
(`queries.test.ts`, `objects/page.test.tsx`) or a recording stub Supabase
client (`supabaseDataSource.test.ts`) - and does not depend on real
environment variables at all; `objects/page.test.tsx` mocks the
`@/lib/directory/supabaseDataSource` module itself as the injection seam.

## Tests and verification results

- `npm run format:check` — passed.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm run test` — passed after Codex review: 16 files, **139 tests** (95 →
  139; 44 net new, with the unbounded back-stack tests removed and an
  oversized-token regression test added). New coverage: cursor
  encode/decode/validate (including malformed/tampered and oversized
  cursors, and a name
  containing commas/parens/diacritics/quotes), pagination orchestration
  (deterministic ordering, page-size enforcement, the exact
  same-name-boundary scenario, insertion-order independence, error
  wrapping), the real Supabase query construction (exact filter/order/limit
  calls per method, error propagation, and the "no filter-string injection"
  regression guard), card rendering with complete and with missing optional
  data, slug-based linking, the four `ObjectsPage` result states, pagination
  link presence/absence, and `SiteHeader`'s per-route `aria-current`.
- `npm run build` — passed. `/objects` is correctly marked dynamic (`ƒ`,
  server-rendered on demand), not statically prerendered - expected, since
  it depends on `searchParams` and live data; `/` remains static.
- `npm audit --omit=dev` — zero vulnerabilities (including with
  `@supabase/supabase-js` newly added).
- **Manual end-to-end verification** (beyond what the brief asked for, done
  because this session cannot reach a real Supabase project to test
  against): built a minimal mock PostgREST-shaped HTTP server, pointed
  `NEXT_PUBLIC_SUPABASE_URL` at it, ran `next start`, and drove the real
  production server with Playwright. Confirmed: the normal-results state
  renders a 4-column card grid at 1440px and a single stacked column at
  390px with no horizontal overflow at either width (`scrollWidth ===
clientWidth`); keyboard Tab order reaches the skip link, wordmark,
  "Sākums", "Objekti" and then each card's title link in document order,
  each with a visible 3px accent focus outline; clicking "Nākamā lapa"
  genuinely advances to different rows; the empty and
  misconfigured-environment states render their generic Latvian messages
  with no leaked environment-variable names, connection details or stack
  content in the rendered HTML (checked by substring search over the
  response). See "Known limitations" below for the one real rough edge this
  pass found.

## Decisions requiring Codex review

1. **Bounded, next-only URL pagination after Codex review.** The original
   `back` history was removed because it grew on every page and did not meet
   the permanent 5,000-object scale constraint. Browser Back remains
   available. A future explicit previous-page control should be backed by a
   reverse keyset query.
2. **Two-query keyset boundary instead of a single composite PostgREST
   filter** (detailed above). This avoids hand-built filter-string
   escaping that could not be verified against a live endpoint from this
   session; the cost is up to one extra small request per page past the
   first. If Codex has access to the real `muizasmanor26-dev` project,
   worth a real end-to-end check against production data, particularly a
   title containing a comma or parenthesis crossing a page boundary.
3. **`object_type` and `ownership_type` Latvian display labels
   (`src/lib/directory/labels.ts`) are this session's own wording**, not
   sourced from any existing doc - unlike `condition_category`, which has
   an exact public-label table in `docs/DATA_MODEL.md`. Worth a product/
   copy review before this ships publicly.
4. **`publicAccessStatus` has no real data source.** The brief asks the
   card to "support the available values for... public-access status, if
   available." No such column exists in `docs/DATA_MODEL.md` or any Day
   8/9 migration. `DirectoryObjectSummary.publicAccessStatus` exists as a
   field and the card renders it when present, but the real query always
   returns `null` for it today - see "Known limitations."
5. **The directory's 24-per-page grid currently has nothing real to show.**
   No `heritage_objects` row has reached `status = 'published'` yet (the
   Day 10 live-verification session kept the Rundāle trio `draft`; Day 11's
   dataset has not been staged). This was expected and is exactly why the
   brief asked for a real, tested empty state rather than seed data -
   flagging it here only so Codex doesn't read "0 published objects" as a
   bug.

## Known limitations carried to Days 14-16

- **One-time keyboard-focus reset during the loading→loaded transition.**
  Manual testing found that tabbing through the page in the brief window
  between the initial HTML (showing `loading.tsx`'s skeleton) and the
  Suspense boundary swapping in the real content can land focus on
  `<body>` once, if the swap happens mid-tab-sequence; tabbing resumes
  correctly (back to the skip link) on the next press, and focus behaves
  perfectly once the swap has settled (confirmed by waiting for real
  content before tabbing - see "Verification" above). This is inherent to
  React/Next's streaming Suspense-boundary replacement, not specific to
  this page's own code, and would affect any route with a `loading.tsx`.
  Not fixed here since it would mean overriding Next's own streaming
  mechanism; noting it for whoever next touches loading states.
- **`publicAccessStatus` is always `null`** until a real column/source
  exists (see decision 3 above) - the card and summary type already carry
  the field so a later day can wire it up without another shape change.
- **No image pipeline.** `HeritageObjectCard`'s media area is an explicitly
  decorative, `aria-hidden` placeholder block, not a photo - Day 15's job.
- **No `/objects/[slug]` detail page yet.** Card titles point at
  `/objects/<slug>`, which 404s today - Day 14's job; this is an explicit,
  allowed forward reference per the brief.
- **Day 11's editorial queue is still open and still does not block this
  page.** `object_type`, municipality mapping and the 165 duplicate / 92
  relationship candidates remain unresolved; nothing here changes that
  status, and this page was built and tested entirely without needing any
  of it resolved.
- **Connection shape for Vercel/serverless is still an open question for a
  later infrastructure day** (`docs/SUPABASE_SETUP.md` §5, Day 27) -
  unrelated to this page specifically, since it only uses the anon-key
  PostgREST client (no pooled Postgres connection string involved here at
  all).
