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
|   7 | Create the development Supabase project; enable PostGIS and document safe local configuration.                | [#6](https://github.com/EdVialv/muizasmanor26/issues/6)   | Manual + Claude Code                |  [~]   |
|   8 | Write the first migration for heritage objects, hierarchy, classifications, contacts, sources and families.   | [#6](https://github.com/EdVialv/muizasmanor26/issues/6)   | Claude Code                         |  [ ]   |
|   9 | Add spatial/search/filter indexes, constraints, roles and Row Level Security; inspect query plans.            | [#6](https://github.com/EdVialv/muizasmanor26/issues/6)   | Claude Code, Codex security review  |  [ ]   |
|  10 | Build an idempotent, batched, resumable importer and load the representative sample.                          | [#6](https://github.com/EdVialv/muizasmanor26/issues/6)   | Claude Code                         |  [ ]   |
|  11 | Run an import dry run, inspect failures, fix transformations and document resume/rollback procedures.         | [#6](https://github.com/EdVialv/muizasmanor26/issues/6)   | Claude Code + manual QA             |  [ ]   |
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

**Day 7 is split between a manual step and a documentation/config step.** The documentation/config half is complete but blocked on push, same situation as Days 3–6 — see `PROGRESS.md`. The manual half still needs the project owner, because no AI agent session creates third-party accounts or holds real credentials:

- Claude Code's half (done, on branch `claude/day7-supabase-postgis-setup`, based on current `main` `8284c13`): `docs/SUPABASE_SETUP.md` (the full setup/verification runbook) and the four reserved Supabase variable names added to `.env.example` (no values).
- **Owner's half (not yet done by anyone):** follow `docs/SUPABASE_SETUP.md` sections 1–3 — create the `muizasmanor26-dev` Supabase project, enable PostGIS, run the two verification queries, and fill in a local `.env.local` from the new `.env.example` names. Nothing here can be scripted or delegated; it happens under the owner's own Supabase login.

Once the handoff checklist at the bottom of `docs/SUPABASE_SETUP.md` is checked off, start **Day 8** on issue [#6](https://github.com/EdVialv/muizasmanor26/issues/6): write the first migration using `docs/DATA_MODEL.md` as the schema contract and `docs/DAY6_NORMALIZATION_RULES.md` as the agreed import scope.

## MVP boundary

Do not implement payments, live bookings, subscriptions, premium placement, route optimisation, restoration-provider marketplace or funding-assistance modules during these 30 evenings. Booking-platform fields may exist in the data model, but live integration begins only after commercial validation.
