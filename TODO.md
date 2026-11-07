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
|  11 | Run an import dry run, inspect failures, fix transformations and document resume/rollback procedures.         | [#6](https://github.com/EdVialv/muizasmanor26/issues/6)   | Claude Code + manual QA             |  [~]   |
|  12 | Establish reusable layout, navigation, typography, colour tokens and responsive breakpoints.                  | [#7](https://github.com/EdVialv/muizasmanor26/issues/7)   | Claude Code                         |  [ ]   |
|  13 | Build cards and a cursor-paginated server-side directory with loading, empty and error states.                | [#7](https://github.com/EdVialv/muizasmanor26/issues/7)   | Claude Code                         |  [ ]   |
|  14 | Build `/objects/[slug]` detail pages with hierarchy, history, condition, ownership and services.              | [#7](https://github.com/EdVialv/muizasmanor26/issues/7)   | Claude Code                         |  [ ]   |
|  15 | Add lazy responsive images, credits, sources, verification dates, contacts and accessibility text.            | [#7](https://github.com/EdVialv/muizasmanor26/issues/7)   | Claude Code + manual content review |  [ ]   |
|  16 | Implement indexed multilingual name/location search with debouncing and no-result guidance.                   | [#9](https://github.com/EdVialv/muizasmanor26/issues/9)   | Claude Code                         |  [ ]   |
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

**Days 7–10 are complete on the real development environment; Day 11's non-destructive dry run against the real raw blog dataset is now done and documented, including a completed scope-confirmation pass, but not yet acted on.** `npm run day11:dry-run` was run against the real `muizasdb_pic.xlsx` (16,800 image rows, 3,716 unique posts via `Bloga ieraksta Nr.` - figures matching `docs/DAY5_COLUMN_MAPPING.md`'s profile exactly). The full classification/failure report is committed at `docs/day11-dry-run-output/` and explained in `docs/DAY11_DRY_RUN_NOTES.md`. Nothing was written to any database: no migration ran, and no row was staged or imported.

**The manual scope-confirmation pass requested after the dry run is done (see `docs/DAY11_DRY_RUN_NOTES.md` decision 10):** every post now has a real, confirmed `in_scope`/`archived_out_of_scope` decision with a recorded basis, instead of the earlier three-bucket unconfirmed proposal. 1,553 posts are `in_scope` (1,452 by title keyword, 101 by an explicit manor-affiliation phrase found in the post's own body text) and 2,163 are `archived_out_of_scope` (a real but reversible decision - nothing is deleted). This was reached purely from each post's own title+body text, not an outside manual review of every post's photos/context, so it is a defensible first pass, not a claim of certainty for every post.

**Before Day 12 (or any further Day 11 work) touches `staging_heritage_objects`:** work through `docs/DAY11_DRY_RUN_NOTES.md`'s remaining "Open items" - per-post `object_type` assignment, a `municipality`-extraction design, and manual resolution of the 165 duplicate and 92 relationship candidates. Every post in this dataset currently resolves to confirmed `needs_review` (1,553) or confirmed `archived_out_of_scope` (2,163) - none can reach `ready_for_import` through automation alone, the same structural finding Day 10 already proved on the 25-row sample, now confirmed at full scale.

**A Codex review of this Day 11 work found 4 real correctness issues (global slug uniqueness, unbalanced-parentheses detection, duplicate-vs-relationship classification, and Excel hyperlink-target extraction) - all 4 are fixed, with regression tests, on this same branch (see `docs/DAY11_DRY_RUN_NOTES.md` decision 11).** Re-running the dry run against the same real workbook after the fixes shows the headline figures above are unchanged - this specific dataset didn't happen to exercise the edge case most of the bugs required - except for a new `imageIdentitySourceCounts` report statistic (100% `drive_file_id`) added at Codex's request. The fixes are still real and necessary; decision 11 documents, for each one, exactly what was verified on the real data.

## MVP boundary

Do not implement payments, live bookings, subscriptions, premium placement, route optimisation, restoration-provider marketplace or funding-assistance modules during these 30 evenings. Booking-platform fields may exist in the data model, but live integration begins only after commercial validation.
