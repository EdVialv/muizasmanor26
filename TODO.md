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
|  17 | Add object-type, region, public-access, accommodation, catering and event filters.                            | [#9](https://github.com/EdVialv/muizasmanor26/issues/9)   | Claude Code                         |  [ ]   |
|  18 | Add condition, ownership and historical-family filters with verified labels and null handling.                | [#9](https://github.com/EdVialv/muizasmanor26/issues/9)   | Claude Code, Codex review           |  [ ]   |
|  19 | Integrate Leaflet with production tiles, viewport queries, clustering and list-to-map navigation.             | [#9](https://github.com/EdVialv/muizasmanor26/issues/9)   | Claude Code                         |  [ ]   |
|  20 | Synchronise indexed filters, cursor pagination and map viewport through shareable URL parameters.             | [#9](https://github.com/EdVialv/muizasmanor26/issues/9)   | Claude Code                         |  [ ]   |
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

**Day 14 is complete on `claude/day14-object-pages`, not yet merged:** `/objects/[slug]` shows a published object's name, type, location, description, condition, ownership category, verified historical owners and its parent/child objects, each linked. Unknown, malformed and unpublished slugs return a real HTTP 404. Cards and related-object links carry the visitor's directory page as a single `from` token, so "back to the directory" returns to the same page. Services, images, sources, contacts and access information are not shown: the schema has no service fields at all, and the rest is Day 15. See `docs/DAY14_OBJECT_PAGES_NOTES.md` for 7 recorded decisions.

**Day 15 is complete on `claude/day15-visual-alpha`, not yet merged:** responsive, lazy-loaded images in fixed-ratio boxes with a clean fallback, photo credits and licences, the recorded source and verification dates, public contacts, and visitor-access/accessibility information that distinguishes "not recorded" from "not accessible". It adds one migration, `supabase/migrations/20261113090000_object_images_access.sql` (an `object_images` table and access columns), which **must be applied before this code is deployed** and has not been applied anywhere. Images are displayed from the workbook's column G URLs on the owner's instruction; real images could not be loaded from the build sandbox, so that needs a check in a real browser. See `docs/DAY15_VISUAL_ALPHA_NOTES.md` and `docs/day15-screenshots/`.

**Day 16 is complete on `claude/day16-search`, not yet merged:** `/objects?q=…` searches published objects by name, municipality and every recorded alternate/historical name, case- and diacritic-insensitively (`timanu` finds Tīmaņu muiža, `Tymanow` its historical Polish name). It is a server-side query backed by a maintained, folded search document with a trigram index, paginated with the directory's own keyset order. The field is debounced (300 ms), lives in the URL (refresh, sharing and Back/Forward work) and binds every cursor to its search so it cannot carry over to another. It adds one migration, `supabase/migrations/20261113120000_directory_search.sql`, which **must be applied after the Day 15 migration and before this code is deployed**, and has not been applied anywhere. See `docs/DAY16_SEARCH_NOTES.md` for the matching rules, their limitations (no stemming, no ranking) and locally measured performance at 10,835 rows.

Next: review and merge Days 14, 15 and 16 in order, applying the two migrations, then **Day 17** on issue [#9](https://github.com/EdVialv/muizasmanor26/issues/9): object-type, region, public-access, accommodation, catering and event filters.

In parallel, continue the editorial data stream before any bulk staging: assign `object_type`, define municipality mapping, and review the 165 duplicate and 92 relationship candidates documented by Day 11. This does not block the visual directory implementation, but it does block promotion of the real bulk dataset.

## MVP boundary

Do not implement payments, live bookings, subscriptions, premium placement, route optimisation, restoration-provider marketplace or funding-assistance modules during these 30 evenings. Booking-platform fields may exist in the data model, but live integration begins only after commercial validation.
