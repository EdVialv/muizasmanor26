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

## 30-evening roadmap

| Day | Two-hour outcome                                                                                          | Linked issue                                              | Main tool                           | Status |
| --: | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------- | :----: |
|   1 | Define the MVP, architecture, data contract, repository workflow and initial Next.js shell.               | [#1](https://github.com/EdVialv/muizasmanor26/issues/1)   | Codex + manual decisions            |  [x]   |
|   2 | Commit the npm lockfile; configure ESLint and formatting; confirm a clean local install.                  | [#5](https://github.com/EdVialv/muizasmanor26/issues/5)   | Codex                               |  [x]   |
|   3 | Add unit-test tooling and GitHub Actions for type checking, tests and production builds.                  | [#5](https://github.com/EdVialv/muizasmanor26/issues/5)   | Claude Code, Codex review           |  [ ]   |
|   4 | Select 20–30 representative manor records covering complete, incomplete and unusual cases.                | [#8](https://github.com/EdVialv/muizasmanor26/issues/8)   | Manual data review                  |  [ ]   |
|   5 | Map existing dataset columns to the proposed fields; record missing and conflicting values.               | [#8](https://github.com/EdVialv/muizasmanor26/issues/8)   | Manual + Codex                      |  [ ]   |
|   6 | Define normalisation, duplicate detection, validation and rejected-row rules.                             | [#8](https://github.com/EdVialv/muizasmanor26/issues/8)   | Codex                               |  [ ]   |
|   7 | Create the development Supabase project and document safe local environment configuration.                | [#6](https://github.com/EdVialv/muizasmanor26/issues/6)   | Manual + Claude Code                |  [ ]   |
|   8 | Write the first SQL migration for manors, classifications, contacts, sources and historical families.     | [#6](https://github.com/EdVialv/muizasmanor26/issues/6)   | Claude Code                         |  [ ]   |
|   9 | Add indexes, constraints, roles and Row Level Security policies; review authorization boundaries.         | [#6](https://github.com/EdVialv/muizasmanor26/issues/6)   | Claude Code, Codex security review  |  [ ]   |
|  10 | Build a repeatable importer and load the representative sample into development.                          | [#6](https://github.com/EdVialv/muizasmanor26/issues/6)   | Claude Code                         |  [ ]   |
|  11 | Run an import dry run, inspect failures, fix transformations and document the rollback procedure.         | [#6](https://github.com/EdVialv/muizasmanor26/issues/6)   | Claude Code + manual QA             |  [ ]   |
|  12 | Establish reusable layout, navigation, typography, colour tokens and responsive breakpoints.              | [#7](https://github.com/EdVialv/muizasmanor26/issues/7)   | Claude Code                         |  [ ]   |
|  13 | Build manor cards and the paginated public directory with loading, empty and error states.                | [#7](https://github.com/EdVialv/muizasmanor26/issues/7)   | Claude Code                         |  [ ]   |
|  14 | Build the `/manors/[slug]` detail page with history, condition, ownership and service information.        | [#7](https://github.com/EdVialv/muizasmanor26/issues/7)   | Claude Code                         |  [ ]   |
|  15 | Add images, credits, source links, verification dates, contacts and accessibility text.                   | [#7](https://github.com/EdVialv/muizasmanor26/issues/7)   | Claude Code + manual content review |  [ ]   |
|  16 | Implement name and location search with debouncing and useful no-result guidance.                         | [#9](https://github.com/EdVialv/muizasmanor26/issues/9)   | Claude Code                         |  [ ]   |
|  17 | Add region, public-access, accommodation, catering and event-availability filters.                        | [#9](https://github.com/EdVialv/muizasmanor26/issues/9)   | Claude Code                         |  [ ]   |
|  18 | Add condition, ownership and historical-owner-family filters with verified labels and null handling.      | [#9](https://github.com/EdVialv/muizasmanor26/issues/9)   | Claude Code, Codex review           |  [ ]   |
|  19 | Integrate Mapbox and display manor markers with accessible list-to-map navigation.                        | [#9](https://github.com/EdVialv/muizasmanor26/issues/9)   | Claude Code                         |  [ ]   |
|  20 | Synchronise search, filters, pagination and map state through shareable URL parameters.                   | [#9](https://github.com/EdVialv/muizasmanor26/issues/9)   | Claude Code                         |  [ ]   |
|  21 | Configure Supabase authentication and define administrator and editor permissions.                        | [#10](https://github.com/EdVialv/muizasmanor26/issues/10) | Claude Code, Codex security review  |  [ ]   |
|  22 | Build the protected admin record list and create/edit forms with server-side validation.                  | [#10](https://github.com/EdVialv/muizasmanor26/issues/10) | Claude Code                         |  [ ]   |
|  23 | Implement draft, review, publish and archive transitions with audit metadata and authorization tests.     | [#10](https://github.com/EdVialv/muizasmanor26/issues/10) | Claude Code, Codex review           |  [ ]   |
|  24 | Build the accessible event-enquiry form, consent language and confirmation state.                         | [#11](https://github.com/EdVialv/muizasmanor26/issues/11) | Claude Code + manual copy review    |  [ ]   |
|  25 | Add server-side validation, enquiry storage and Resend email notifications.                               | [#11](https://github.com/EdVialv/muizasmanor26/issues/11) | Claude Code                         |  [ ]   |
|  26 | Add spam protection, delivery logging, privacy safeguards and end-to-end enquiry tests.                   | [#11](https://github.com/EdVialv/muizasmanor26/issues/11) | Claude Code, Codex security review  |  [ ]   |
|  27 | Configure Vercel preview/production environments, Cloudflare, Sentry and privacy-aware PostHog.           | [#12](https://github.com/EdVialv/muizasmanor26/issues/12) | Manual + Claude Code                |  [ ]   |
|  28 | Run mobile/desktop accessibility, SEO, performance, security and backup-recovery checks.                  | [#12](https://github.com/EdVialv/muizasmanor26/issues/12) | Codex + manual QA                   |  [ ]   |
|  29 | Conduct five structured user tests, fix launch blockers and publish the MVP when launch criteria pass.    | [#12](https://github.com/EdVialv/muizasmanor26/issues/12) | Manual testing + Codex              |  [ ]   |
|  30 | Review analytics and interviews; rank one paid experiment and create its separate implementation backlog. | [#13](https://github.com/EdVialv/muizasmanor26/issues/13) | Manual decisions + Codex            |  [ ]   |

## Current next action

Start **Day 3** on issue [#5](https://github.com/EdVialv/muizasmanor26/issues/5):

- select and configure the unit-test framework;
- add initial component and configuration smoke tests;
- create GitHub Actions for formatting, linting, type checking, tests and production builds;
- verify the workflow on a pull request.

## MVP boundary

Do not implement payments, live bookings, subscriptions, premium placement, route optimisation, restoration-provider marketplace or funding-assistance modules during these 30 evenings. Booking-platform fields may exist in the data model, but live integration begins only after commercial validation.
