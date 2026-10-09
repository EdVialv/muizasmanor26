# Shared progress log

This file is the handoff record shared by **Codex**, **Claude Code** and the project owner.

Read it before starting a session and update it before ending a session.

## Coordination rules

1. Work on only one clearly identified GitHub issue per session.
2. Create a dedicated branch before changing project files.
3. Codex and Claude Code must never write to the same branch simultaneously.
4. Record the active agent, branch and issue in **Current work** before implementation.
5. Pull the latest `main` before starting and before handing work to the other agent.
6. At the end of a session, record files changed, verification results, decisions, blockers and the exact next action.
7. Do not record API keys, tokens, passwords, personal data or other secrets here.
8. Do not mark work complete unless the listed verification commands actually passed.
9. Keep historical session entries; correct mistakes with a new note rather than silently deleting the record.
10. When a pull request is merged, clear **Current work** and update **Project position**.

## Project position

- **Current roadmap day:** Day 6
- **Last completed-and-merged day:** Day 5
- **Current issue:** [#8 — Data model and sample dataset](https://github.com/EdVialv/muizasmanor26/issues/8)
- **Next outcome:** Define the import scope, normalisation, stable IDs, duplicate detection, row-collapse precedence and rejected-row rules.
- **MVP status:** Foundation, scale architecture, automated tests, CI, representative sample and verified real-dataset mapping are merged.
- **Detailed plan:** [TODO.md](TODO.md)

## Current work

Update this section when a session starts. Only one write-enabled session should be active.

| Field            | Current value                       |
| ---------------- | ----------------------------------- |
| Status           | Idle                                |
| Agent            | None                                |
| Issue            | None                                |
| Branch           | None                                |
| Session goal     | None                                |
| Started          | None                                |
| Expected handoff | Start Day 6 on issue #8 from `main` |

## Required session entry

Copy this template to the top of **Session history** before ending a session.

```markdown
### YYYY-MM-DD HH:MM Europe/Riga — Codex or Claude Code

- **Issue:** #number — title
- **Branch:** branch-name
- **Pull request:** #number or not opened
- **Session goal:** one sentence
- **Completed:**
  - concrete result
- **Files changed:**
  - path — short explanation
- **Verification:**
  - `command` — passed, failed or not run
- **Decisions:**
  - decision and reason
- **Blockers or risks:**
  - blocker, risk or none
- **Next exact action:**
  - one action another agent can start without guessing
- **Handoff state:** clean, uncommitted changes, awaiting review, blocked or merged
```

## Session history

Add the newest completed session immediately below this heading.

### 2026-10-09 — Codex Day 5 merge and Day 6 handoff

- **Issue:** [#8 — Data model and sample dataset](https://github.com/EdVialv/muizasmanor26/issues/8)
- **Branch:** `codex/day5-reviewed`
- **Pull request:** [#23](https://github.com/EdVialv/muizasmanor26/pull/23) — merged
- **Session goal:** Publish the independently verified source-column mapping.
- **Completed:**
  - confirmed GitHub Actions passed formatting, linting, type checking, tests and the production build;
  - merged the corrected Day 5 mapping;
  - marked Day 5 complete, cleared the active-work lock and advanced the roadmap to Day 6.
- **Verification:**
  - GitHub Actions CI on PR #23 — passed.
- **Decisions:**
  - treat the verified Day 5 profile as the source of truth for Day 6 import-rule design.
- **Blockers or risks:**
  - the import scope for non-manor heritage objects remains a Day 6 product decision.
- **Next exact action:**
  - Claude Code should pull `main`, read `docs/DAY5_COLUMN_MAPPING.md`, `TODO.md` and `PROGRESS.md`, claim issue #8, and define the Day 6 rules before writing importer code.
- **Handoff state:** merged

### 2026-10-09 — Codex review of Claude Day 5 bundle

- **Issue:** [#8 — Data model and sample dataset](https://github.com/EdVialv/muizasmanor26/issues/8)
- **Branch:** `codex/day5-reviewed`
- **Pull request:** to be opened
- **Session goal:** Reproduce Claude's source analysis against `muizasdb_pic.xlsx`, correct the mapping report and publish it.
- **Completed:**
  - verified 16,800 image rows, 11 columns and 3,716 permanent blog-post identifiers against the source workbook;
  - confirmed image-count statistics, unique titles and URLs, and the 2 address, 4 coordinate and 12 body-text within-post inconsistencies;
  - corrected placeholder counts to distinguish any occurrence from values still unresolved after row collapse;
  - corrected the coordinate cross-check to 2,632 posts, all agreeing after handling the label dash correctly;
  - corrected the out-of-bound coordinate inventory from 10 to 17: 15 genuine foreign sites and 2 malformed Latvian coordinates;
  - corrected the title keyword scan so place names ending in `-pils` are not classified as castles and disclosed overlapping categories;
  - recorded the owner's confirmation that blog post numbers are permanent and images may be used with source attribution, with detailed licence assessment deferred.
- **Files changed:**
  - `docs/DAY5_COLUMN_MAPPING.md` — independently verified and corrected source profile;
  - `TODO.md`, `PROGRESS.md` — review state and Day 6 handoff.
- **Verification:**
  - workbook profiling against SHA-256 `49e8ca0d5c61e22f91bcf5a2bdfb4a75a73704ae23b3545a8c26948f7b64f199` — passed;
  - `npm ci` — passed;
  - `npm run format:check` — passed;
  - `npm run lint` — passed;
  - `npm run typecheck` — passed;
  - `npm run test` and `npm run test:coverage` — passed (7 tests);
  - `npm run build` — passed.
- **Decisions:**
  - use `source_system = manasvietas_blogspot` plus permanent `Bloga ieraksta Nr.` as the idempotent import key;
  - retain 15 foreign records in source provenance but exclude them from the Latvia-only MVP directory and map;
  - preserve original image URLs and attribution; perform detailed rights assessment later.
- **Blockers or risks:**
  - Day 6 must settle the import scope because the source contains many non-manor heritage objects;
  - two malformed Latvian coordinates require manual source checking rather than guessed correction.
- **Next exact action:**
  - merge after pull-request CI passes, clear Current work, then define the Day 6 normalisation and rejection rules.
- **Handoff state:** awaiting review

### 2026-10-08 11:40 Europe/Riga — Claude Code

- **Issue:** [#8 — Data model and sample dataset](https://github.com/EdVialv/muizasmanor26/issues/8)
- **Branch:** `claude/day5-column-mapping`
- **Pull request:** not opened (this session has no GitHub write access; see Blockers)
- **Session goal:** Map the owner's real dataset (`muizasdb_pic.xlsx`) columns onto the heritage-object fields in `docs/DATA_MODEL.md`, and record missing/conflicting/multi-value data without changing source values.
- **Completed:**
  - profiled the owner's uploaded export: 1 sheet, 11 columns, 16,800 image-rows grouping into 3,716 unique posts via `Bloga ieraksta Nr.` (zero duplicates, no duplicate titles);
  - mapped each of the 11 source columns to a `docs/DATA_MODEL.md` field, a future per-image relation, or "unmapped," and listed every target field with no source signal at all (`object_type`, `slug`, `parent_object_id`, `status`, `last_verified_at`, condition/ownership/family fields, `object_cadastre_references`);
  - inventoried the source's literal "not found" placeholder strings (`Koordinātas nav atrastas` in 507/3,716 posts, `Adrese nav atrasta` in 27/3,716) that must become real nulls on import rather than text;
  - found and listed within-post inconsistencies across a post's own image rows (2 posts disagree on `Adrese`, 4 on `Koordinātas`, 12 on body text) — all 4 coordinate cases are a real-value-vs-placeholder pattern, not two conflicting real values;
  - cross-validated the `Koordinātas` column against coordinates embedded inline in `Adrese` text for the 1,094 posts carrying both: all agree;
  - found 10 posts with coordinates outside an approximate Latvia bounding box: 6 are genuine Poland-based sites tied to the same noble-family history (Warsaw x5, Białystok x1), 2 look like malformed/truncated Latvia coordinates needing manual re-check rather than auto-correction;
  - ran a keyword scan of post titles against the current `object_type` enum and found the dataset is materially broader than manors (muiža 45.5%; churches, mills, schools, cemeteries, stations and bridges together over 1,200 more posts; 20.6% match none of these groups) — flagged as an open Day 6 scope question rather than deciding it here.
- **Files changed:**
  - `docs/DAY5_COLUMN_MAPPING.md` — the full column mapping, null-handling rules, conflict findings and open questions;
  - `TODO.md`, `PROGRESS.md` — Day 5 status and Day 6 handoff.
- **Verification:**
  - `npm run format:check` — passed;
  - `npm run lint` — passed;
  - `npm run typecheck` — passed;
  - `npm run test` — passed;
  - `npm run build` — passed.
- **Decisions:**
  - documented the mapping and its gaps only; did not generate slugs, assign `object_type`, infer condition/ownership, or deduplicate — all left to Day 6 per the existing data-quality rules;
  - treated the 6 Poland-located posts as real data to exclude from the Latvia-only map view, not as errors to delete or coerce into Latvia; treated the 2 malformed-coordinate posts as needing a manual re-check, not a guessed correction.
- **Blockers or risks:**
  - this session has no tool to push commits or open a pull request, same as Days 3 and 4 — the branch and diff exist only in the session workspace and must be pushed/opened by the project owner or a session with write access (delivered as a git bundle);
  - the `object_type` scope question (how much of this 3,716-post dataset fits the current enum) is unresolved and should be settled before Day 6's normalisation work, since it affects the majority of non-manor posts.
- **Next exact action:**
  - push `claude/day5-column-mapping` (or apply the delivered bundle), open the pull request against `main`, confirm CI passes, merge, then start Day 6 on issue #8 using `docs/DAY5_COLUMN_MAPPING.md`'s "Summary for Day 6" section as the starting checklist.
- **Handoff state:** uncommitted changes (committed locally on `claude/day5-column-mapping`, not pushed)

### 2026-10-08 — Codex bundle publication and handoff

- **Issues:** [#5 — Set up development quality and CI baseline](https://github.com/EdVialv/muizasmanor26/issues/5) and [#8 — Data model and sample dataset](https://github.com/EdVialv/muizasmanor26/issues/8)
- **Branches:** `codex/day3-reviewed`, `codex/day4-reviewed`
- **Pull requests:** [#20](https://github.com/EdVialv/muizasmanor26/pull/20) and [#21](https://github.com/EdVialv/muizasmanor26/pull/21) — merged
- **Session goal:** Review both Claude bundles, correct material issues, verify them locally and remotely, and publish them in dependency order.
- **Completed:**
  - reviewed and rebased Day 3, upgraded the runtime baseline, pinned CI actions, and merged PR #20;
  - reviewed and corrected Day 4's field semantics, classifications, hierarchy and cadastral model, and merged PR #21;
  - confirmed the GitHub Actions workflow passed on both pull requests;
  - advanced the shared roadmap to Day 5 and cleared the active-work lock.
- **Verification:**
  - local format, lint, typecheck, tests, coverage and production build — passed for Day 3;
  - local CSV assertions, format, lint, typecheck, tests and production build — passed for Day 4;
  - GitHub Actions CI — passed on PR #20 and PR #21.
- **Decisions:**
  - treat the 25-record sample as a research and edge-case artifact, not publishable or import-ready data;
  - start Day 5 from the owner's actual dataset and preserve its source columns during mapping.
- **Blockers or risks:**
  - Day 5 requires access to the owner's actual dataset or a representative export with unchanged column names;
  - the Mežotnes hillfort source returned HTTP 502 and still needs replacement or rechecking during source verification.
- **Next exact action:**
  - Claude Code should pull `main`, read `TODO.md` and `PROGRESS.md`, claim issue #8 in Current work, and map the owner's existing dataset columns for Day 5.
- **Handoff state:** merged

### 2026-10-08 — Codex review of Claude Day 4 bundle

- **Issue:** [#8 — Data model and sample dataset](https://github.com/EdVialv/muizasmanor26/issues/8)
- **Branch:** `codex/day4-reviewed`
- **Pull request:** to be opened
- **Session goal:** Review, correct and publish Claude's 25-record representative sample.
- **Completed:**
  - recovered the Day 4 bundle and preserved its 25 real candidate records;
  - validated row counts, headers, enums, unique slugs, dates, source URLs and parent references;
  - removed condition and ownership classifications that had been inferred from use or old descriptions;
  - removed invalid parent links from newer manor houses to older medieval castles;
  - distinguished English research summaries and source-access dates from publishable Latvian fields and factual verification;
  - replaced the one-field cadastral model with a many-reference relation that distinguishes property numbers from object designations.
- **Verification:**
  - CSV structural assertions — passed for 25 rows;
  - `npm run format:check` — passed;
  - `npm run lint` — passed;
  - `npm run typecheck` — passed;
  - `npm run build` — passed.
- **Decisions:**
  - retain the sample as a research artifact, not import-ready or publishable content;
  - require authoritative verification during Days 5–6 because 15 rows currently cite English Wikipedia as their only source;
  - keep only genuine containment links; model same-complex relationships separately during Day 6 if needed.
- **Blockers or risks:**
  - the Mežotnes hillfort source returned HTTP 502 during review and needs replacement or later rechecking;
  - factual claims were not independently reverified record by record in this sample-selection phase.
- **Next exact action:**
  - merge after pull-request checks pass, then start Day 5 using the owner's actual dataset rather than expanding this hand-researched sample.
- **Handoff state:** awaiting review

### 2026-10-08 — Codex review of Claude Day 3 bundle

- **Issue:** [#5 — Set up development quality and CI baseline](https://github.com/EdVialv/muizasmanor26/issues/5)
- **Branch:** `codex/day3-reviewed`
- **Pull request:** to be opened
- **Session goal:** Review, rebase and publish Claude's Day 3 bundle.
- **Completed:**
  - rebased the test and CI work onto current `main` after PR #19;
  - independently reran all seven tests, coverage, formatting, linting, type checking and the production build;
  - replaced end-of-life Node.js 20 with Node.js 24 for local and CI requirements;
  - pinned GitHub Actions dependencies to immutable commit SHAs;
  - updated local prerequisites and the obsolete Mapbox secret reference.
- **Verification:**
  - `npm ci` — passed;
  - `npm run format:check` — passed;
  - `npm run lint` — passed;
  - `npm run typecheck` — passed;
  - `npm run test` — passed (3 files, 7 tests);
  - `npm run test:coverage` — passed;
  - `npm run build` — passed.
- **Decisions:**
  - retained Claude's Vitest and React Testing Library design;
  - used the supported Node.js 24 LTS line because Node.js 20 reached end of life in 2026.
- **Blockers or risks:**
  - GitHub Actions still needs to pass on the pull request before merge.
- **Next exact action:**
  - open the pull request, confirm remote CI, then merge Day 3 before merging Day 4.
- **Handoff state:** awaiting review

### 2026-10-08 00:25 Europe/Riga — Claude Code

- **Issue:** [#5 — Set up development quality and CI baseline](https://github.com/EdVialv/muizasmanor26/issues/5)
- **Branch:** `claude/day3-test-and-ci`
- **Pull request:** not opened (this session has no GitHub write access; see Blockers)
- **Session goal:** Complete Day 3 by adding unit-test tooling, initial smoke tests, and a GitHub Actions CI workflow.
- **Completed:**
  - added Vitest with jsdom, React Testing Library and jest-dom matchers, resolving the `@/*` path alias via Vite's native `resolve.tsconfigPaths`;
  - added `vitest.config.mts` and `vitest.setup.ts`;
  - added three component/configuration smoke test files covering the home page, root layout metadata and `next.config.ts`;
  - added `npm run test`, `npm run test:watch` and `npm run test:coverage` scripts;
  - added `.github/workflows/ci.yml` running format check, lint, typecheck, test and build on every push to `main` and every pull request;
  - updated `CONTRIBUTING.md` required-checks list and noted that CI enforces the same checks.
- **Files changed:**
  - `package.json`, `package-lock.json` — added Vitest/Testing Library dev dependencies and test scripts;
  - `vitest.config.mts`, `vitest.setup.ts` — test runner configuration;
  - `src/app/page.test.tsx`, `src/app/layout.test.tsx`, `next.config.test.ts` — smoke tests;
  - `.github/workflows/ci.yml` — CI workflow;
  - `CONTRIBUTING.md` — updated required local checks and CI note;
  - `TODO.md`, `PROGRESS.md` — Day 3 completion and Day 4 handoff.
- **Verification:**
  - `npm ci` — passed;
  - `npm run format:check` — passed;
  - `npm run lint` — passed;
  - `npm run typecheck` — passed;
  - `npm run test` — passed (3 files, 7 tests);
  - `npm run build` — passed.
- **Decisions:**
  - chose Vitest + React Testing Library over Jest for native ESM/Next.js 16 + React 19 compatibility and faster startup;
  - used Vite's built-in `resolve.tsconfigPaths` instead of the `vite-tsconfig-paths` plugin to avoid an extra dependency;
  - named the config `vitest.config.mts` to avoid the CommonJS/ESM loader warning without changing the package's module type.
- **Blockers or risks:**
  - this session has a linked GitHub account (read access confirmed) but no tool to push commits or open a pull request; the branch and diff exist only in the session workspace and must be pushed/opened by the project owner or a session with write access;
  - CI workflow has not yet been verified against an actual pull request run on GitHub, since it could not be pushed from here — the next session should confirm it runs and passes on GitHub Actions once pushed.
- **Next exact action:**
  - push `claude/day3-test-and-ci` to GitHub, open the pull request against `main`, confirm the CI workflow runs and passes, then merge and start Day 4 from issue #8.
- **Handoff state:** uncommitted changes (committed locally on `claude/day3-test-and-ci`, not pushed)

### 2026-10-07 18:22 Europe/Riga — Codex

- **Issue:** [#5 — Set up development quality and CI baseline](https://github.com/EdVialv/muizasmanor26/issues/5)
- **Branch:** `codex/day-02-quality-baseline`
- **Pull request:** [#16](https://github.com/EdVialv/muizasmanor26/pull/16) — merged
- **Session goal:** Complete Day 2 by locking dependencies, configuring linting and formatting, and verifying a clean production build.
- **Completed:**
  - generated and verified `package-lock.json`;
  - configured ESLint with the Next.js Core Web Vitals and TypeScript rules;
  - configured Prettier and repository formatting scripts;
  - formatted the existing source and documentation baseline;
  - updated contributor verification commands.
- **Files changed:**
  - `package.json` and `package-lock.json` — locked quality-tool dependencies and added scripts;
  - `eslint.config.mjs` — Next.js and TypeScript lint rules;
  - `prettier.config.mjs` and `.prettierignore` — formatting policy;
  - `CONTRIBUTING.md` — required local checks;
  - existing source and Markdown files — one-time Prettier baseline;
  - `TODO.md` and `PROGRESS.md` — Day 2 completion and Day 3 handoff.
- **Verification:**
  - `npm ci` — passed;
  - `npm ls eslint eslint-config-next prettier` — passed with a valid dependency tree;
  - `npm run format:check` — passed;
  - `npm run lint` — passed;
  - `npm run typecheck` — passed;
  - `npm run build` — passed.
- **Decisions:**
  - pinned ESLint 9 because the current Next.js plugin chain does not yet support ESLint 10;
  - retained npm as the package manager and committed its lockfile;
  - formatted the existing repository once so future formatting checks can be enforced without legacy failures.
- **Blockers or risks:**
  - ESLint 9 is no longer the newest major version; upgrade after the Next.js plugin chain declares ESLint 10 compatibility.
- **Next exact action:**
  - complete Day 3 on issue #5 by adding test tooling and the GitHub Actions quality workflow.
- **Handoff state:** merged

### 2026-10-07 17:26 Europe/Riga — Codex

- **Issue:** Documentation coordination requested by project owner
- **Branch:** `codex/add-shared-progress-log`
- **Pull request:** pending at time of entry
- **Session goal:** Create a shared progress and handoff file for Codex and Claude Code.
- **Completed:**
  - created a common session protocol;
  - added current project position and active-work tracking;
  - added a mandatory session-entry template;
  - recorded the existing project foundation and next action.
- **Files changed:**
  - `PROGRESS.md` — shared status, coordination and handoff log;
  - `README.md` — documentation links updated.
- **Verification:**
  - Markdown structure and repository links — reviewed manually.
- **Decisions:**
  - use one shared log and sequential branches;
  - never store credentials or personal data in progress entries.
- **Blockers or risks:**
  - simultaneous edits to this file can cause merge conflicts; agents must work sequentially.
- **Next exact action:**
  - merge this documentation pull request, then start Day 2 from issue #5 on a new branch.
- **Handoff state:** awaiting review

### 2026-10-07 — Codex project foundation

- **Issue:** [#1 — Day 1 foundation](https://github.com/EdVialv/muizasmanor26/issues/1)
- **Pull requests:** [#2](https://github.com/EdVialv/muizasmanor26/pull/2), [#3](https://github.com/EdVialv/muizasmanor26/pull/3), [#4](https://github.com/EdVialv/muizasmanor26/pull/4), [#14](https://github.com/EdVialv/muizasmanor26/pull/14)
- **Completed:**
  - defined MVP scope, architecture and initial data contract;
  - added buyer and real-estate-agent personas;
  - added condition, ownership and historical-family classifications;
  - added structured contacts and booking-platform integration fields;
  - created the Next.js and TypeScript application shell;
  - created the 30-evening roadmap and phase issues.
- **Verification:**
  - `npm install` — passed;
  - `npm run typecheck` — passed;
  - `npm run build` — passed.
- **Next exact action:** Complete Day 2 through issue #5.
- **Handoff state:** merged
