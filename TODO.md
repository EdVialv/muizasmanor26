# Project to-do list

A 30-evening implementation plan for a solo founder working approximately two hours per evening.

## Status legend

- [x] Completed
- [ ] Not started
- [~] In progress
- [!] Blocked

## Session routine

Use the same structure each evening:

1. **10 minutes — prepare:** pull `main`, select the linked issue and create a focused branch.
2. **85 minutes — build:** complete the evening's single defined outcome.
3. **15 minutes — verify:** run relevant type checks, tests and build commands.
4. **10 minutes — record:** commit, push, update the issue and open or update a pull request.

Claude Code may implement a focused task on its own branch. Codex should review the resulting diff, investigate failures and verify tests. Never allow both assistants to write to the same branch simultaneously.

## Permanent scale constraint

The platform will contain more than 5,000 manor estates and related heritage objects. All implementation work must preserve these rules:

- model several object types and parent–child estate relationships;
- paginate public and admin lists on the server;
- run search and filtering in PostgreSQL using tested indexes;
- load map data by viewport and zoom rather than downloading the full collection;
- cluster Leaflet markers and return lightweight map records;
- batch and resume imports safely;
- lazy-load responsive image derivatives;
- validate performance with at least 10,000 generated objects.

## 30-evening roadmap

| Day | Two-hour outcome                                                                                              | Linked issue                                              | Main tool                           | Status |
| --: | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------- | :----: |
|   1 | Define the MVP, architecture, data contract, repository workflow and initial Next.js shell.                   | [#1](https://github.com/EdVialv/muizasmanor26/issues/1)   | Codex + manual decisions            |  [x]   |
|   2 | Commit the npm lockfile; configure ESLint and formatting; confirm a clean local install.                      | [#5](https://github.com/EdVialv/muizasmanor26/issues/5)   | Codex                               |  [x]   |
|   3 | Add unit-test tooling and GitHub Actions for type checking, tests and production builds.                      | [#5](https://github.com/EdVialv/muizasmanor26/issues/5)   | Claude Code, Codex review           |  [x]   |
|   4 | Select 20–30 representative records across object types, hierarchies, complete, incomplete and unusual cases. | [#8](https://github.com/EdVialv/muizasmanor26/issues/8)   | Manual data review                  |  [x]   |
|   5 | Map existing dataset columns to the heritage-object fields; record missing and conflicting values.            | [#8](https://github.com/EdVialv/muizasmanor26/issues/8)   | Manual + Codex                      |  [x]   |
|   6 | Define normalisation, stable IDs, parent–child mapping, duplicate detection and rejected-row rules.           | [#8](https://github.com/EdVialv/muizasmanor26/issues/8)   | Codex                               |  [x]   |
|   7 | Create the development Supabase project; enable PostGIS and document safe local configuration.                | [#6](https://github.com/EdVialv/muizasmanor26/issues/6)   | Manual + Claude Code                |  [x]   |
|   8 | Write the first migration for heritage objects, hierarchy, classifications, contacts, sources and families.   | [#6](https://github.com/EdVialv/muizasmanor26/issues/6)   | Claude Code                         |  [x]   |
|   9 | Add spatial/search/filter indexes, constraints, roles and Row Level Security; inspect query plans.            | [#6](https://github.com/EdVialv/muizasmanor26/issues/6)   | Claude Code, Codex security review  |  [x]   |
|  10 | Build an idempotent, batched, resumable importer and load the representative sample.                          | [#6](https://github.com/EdVialv/muizasmanor26/issues/6)   | Claude Code                         |  [x]   |
|  11 | Run an import dry run, inspect failures, fix transformations and document resume/rollback procedures.         | [#6](https://github.com/EdVialv/muizasmanor26/issues/6)   | Claude Code + manual QA             |  [x]   |
|  12 | Establish reusable layout, navigation, typography, colour tokens and responsive breakpoints.                  | [#7](https://github.com/EdVialv/muizasmanor26/issues/7)   | Claude Code                         |  [x]   |
|  13 | Build cards and a cursor-paginated server-side directory with loading, empty and error states.                | [#7](https://github.com/EdVialv/muizasmanor26/issues/7)   | Claude Code                         |  [x]   |
|  14 | Build `/objects/[slug]` detail pages with hierarchy, history, condition, ownership and services.              | [#7](https://github.com/EdVialv/muizasmanor26/issues/7)   | Claude Code                         |  [x]   |
|  15 | Add lazy responsive images, credits, sources, verification dates, contacts and accessibility text.            | [#7](https://github.com/EdVialv/muizasmanor26/issues/7)   | Claude Code + manual content review |  [x]   |
|  16 | Implement indexed multilingual name/location search with debouncing and no-result guidance.                   | [#9](https://github.com/EdVialv/muizasmanor26/issues/9)   | Claude Code                         |  [x]   |
|  17 | Add object-type, region, public-access, accommodation, catering and event filters.                            | [#9](https://github.com/EdVialv/muizasmanor26/issues/9)   | Claude Code                         |  [x]   |
|  18 | Add condition, ownership and historical-family filters with verified labels and null handling.                | [#9](https://github.com/EdVialv/muizasmanor26/issues/9)   | Claude Code, Codex review           |  [x]   |
|  19 | Integrate Leaflet with production tiles, viewport queries, clustering and list-to-map navigation.             | [#9](https://github.com/EdVialv/muizasmanor26/issues/9)   | Claude Code                         |  [x]   |
|  20 | Synchronise indexed filters, cursor pagination and map viewport through shareable URL parameters.             | [#9](https://github.com/EdVialv/muizasmanor26/issues/9)   | Claude Code                         |  [x]   |
|  21 | Configure Supabase authentication and define administrator and editor permissions.                            | [#10](https://github.com/EdVialv/muizasmanor26/issues/10) | Claude Code, Codex security review  |  [ ]   |
|  22 | Build paginated protected admin lists and create/edit forms with server-side validation.                      | [#10](https://github.com/EdVialv/muizasmanor26/issues/10) | Claude Code                         |  [ ]   |
|  23 | Implement draft, review, publish and archive transitions with audit metadata and authorization tests.         | [#10](https://github.com/EdVialv/muizasmanor26/issues/10) | Claude Code, Codex review           |  [ ]   |
|  24 | Build the accessible event-enquiry form, consent language and confirmation state.                             | [#11](https://github.com/EdVialv/muizasmanor26/issues/11) | Claude Code + manual copy review    |  [ ]   |
|  25 | Add server-side validation, enquiry storage and Resend email notifications.                                   | [#11](https://github.com/EdVialv/muizasmanor26/issues/11) | Claude Code                         |  [ ]   |
|  26 | Add spam protection, delivery logging, privacy safeguards and end-to-end enquiry tests.                       | [#11](https://github.com/EdVialv/muizasmanor26/issues/11) | Claude Code, Codex security review  |  [ ]   |
|  27 | Configure Vercel preview/production, Cloudflare, Sentry and privacy-aware PostHog.                            | [#12](https://github.com/EdVialv/muizasmanor26/issues/12) | Manual + Claude Code                |  [ ]   |
|  28 | Run accessibility, SEO, security, backup recovery and 10,000-object performance tests.                        | [#12](https://github.com/EdVialv/muizasmanor26/issues/12) | Codex + manual QA                   |  [ ]   |
|  29 | Conduct five structured user tests, fix launch blockers and publish when criteria pass.                       | [#12](https://github.com/EdVialv/muizasmanor26/issues/12) | Manual testing + Codex              |  [ ]   |
|  30 | Review analytics and interviews; rank one paid experiment and create its separate backlog.                    | [#13](https://github.com/EdVialv/muizasmanor26/issues/13) | Manual decisions + Codex            |  [ ]   |

## Current next action

**Days 1–12 are merged and verified.** Day 11's non-destructive dry run processed 16,800 image rows into 3,716 posts, and all four Codex review findings are corrected with regression tests. Nothing from the real dataset was staged, imported, auto-merged or auto-linked.

**Day 12 is merged:** the reusable `SiteHeader`, `SiteFooter` and `AppShell`, documented colour/typography/spacing/radius tokens, named responsive breakpoints and keyboard skip link now provide the shared foundation for public pages.

**Day 13 is merged** ([#38](https://github.com/EdVialv/muizasmanor26/pull/38), `ebc4bca`): the public directory at `/objects` is a cursor-paginated (keyset, not offset) Next.js Server Component with tested loading, empty, configuration-error and query-error states. Codex's review removed the unbounded URL history stack and capped cursor-token input; pagination is next-only. See `docs/DAY13_DIRECTORY_NOTES.md`.

**Day 14 is merged** ([#40](https://github.com/EdVialv/muizasmanor26/pull/40)): `/objects/[slug]` shows a published object's name, type, location, description, condition, ownership category, verified historical owners and its parent/child objects, each linked. Unknown, malformed and unpublished slugs return a real HTTP 404. See `docs/DAY14_OBJECT_PAGES_NOTES.md`.

**Day 15 is merged** ([#41](https://github.com/EdVialv/muizasmanor26/pull/41)): responsive images with original-image fallbacks, credits and licences, recorded source and verification dates, public contacts, and visitor-access/accessibility information. Its migration, `supabase/migrations/20261113090000_object_images_access.sql`, **must be applied before this code is deployed**. See `docs/DAY15_VISUAL_ALPHA_NOTES.md`.

**Day 16 is merged** ([#42](https://github.com/EdVialv/muizasmanor26/pull/42)): `/objects?q=…` searches published objects by name, municipality and recorded alternate/historical names, case- and diacritic-insensitively. Search is indexed, bounded, URL-driven and uses query-scoped keyset cursors. Its migration, `supabase/migrations/20261113120000_directory_search.sql`, **must be applied after the Day 15 migration and before search is deployed**. See `docs/DAY16_SEARCH_NOTES.md`.

**Day 17 is implemented, awaiting Codex review** (branch `claude/day17-directory-filters`, `1c09a36`, delivered as a bundle): `/objects` filters by object type, region (stored municipality), public access and recorded accommodation, catering and event-facility services. Filters and search run in one server-side query with URL-synchronised, cursor-scoped pagination. Its migration, `supabase/migrations/20261114090000_directory_filters.sql`, adds three nullable service columns and replaces the Day 16 search function signature. See `docs/DAY17_DIRECTORY_FILTERS_NOTES.md`.

**Day 18 is implemented, awaiting Codex review** (branch `claude/day18-condition-ownership-family`, based on the unreviewed Day 17 commit `1c09a36`, delivered as a bundle). It adds three filters, each with an explicit "Nezināms / nav reģistrēts" choice:

- condition, using the stored categories;
- ownership, using the documented private/public groups;
- historical family, using verified links only, chosen through a bounded, searchable picker.

Its migration, `supabase/migrations/20261115090000_directory_classification_filters.sql`, again replaces the search function signature. Apply it after the Day 15, 16 and 17 migrations, and deploy it together with the Day 18 code. See `docs/DAY18_CLASSIFICATION_FILTERS_NOTES.md`.

**Day 19 is implemented, awaiting Codex review** (branch `claude/day19-map`, based on the corrected Day 18 `8e92f7c`, delivered as a bundle). `/map` shows matching published objects in the viewport with Leaflet: every object as a point up to 500, otherwise exact grid clusters. It uses the same search, filters and shared listing state as the list, with Supercluster clusters, same-position stacks, popups linking to object pages, and an accessible in-view list. Its migration, `supabase/migrations/20261116090000_directory_map.sql`, moves the list's matching rules into shared SQL used by both views and adds the map functions and a spatial index. Apply it after the Day 15–18 migrations. Tiles are configured by `MAP_TILE_*` environment variables; no paid provider is enabled. See `docs/DAY19_MAP_NOTES.md`.

**Day 20 is implemented, awaiting Codex review** (branch `claude/day20-url-state`, based on Day 19 rebased onto the owner-pushed Day 18 as `9de61a3`, delivered as a bundle). The URL now fully describes what a visitor browses: search, filters, the list cursor and the map position (`lat`, `lng`, `zoom`). Direct links, refresh, Back/Forward and "Kopēt saiti" restore the same state in either view. Map moves replace the history entry; filter, page and view changes add one. No migration. See `docs/DAY20_URL_STATE_NOTES.md`.

Next steps:

1. Codex reviews and merges Day 17, then Day 18, then Day 19, then Day 20, rebasing later days if earlier ones change.
2. Apply the Day 15–19 migrations to `muizasmanor26-dev` in order and verify the public pages.
3. Choose a production tile provider (`docs/DAY19_MAP_NOTES.md`, "Tiles") and set `MAP_TILE_*` in the hosting environment.
4. Start **Day 21**: configure Supabase authentication and define administrator and editor permissions.

In parallel, continue the editorial data stream before any bulk staging: assign `object_type`, define municipality mapping, and review the 165 duplicate and 92 relationship candidates documented by Day 11. This does not block the visual directory implementation, but it does block promotion of the real bulk dataset.

## MVP boundary

Do not implement payments, live bookings, subscriptions, premium placement, route optimisation, restoration-provider marketplace or funding-assistance modules during these 30 evenings. Booking-platform fields may exist in the data model, but live integration begins only after commercial validation.
