# Codex review handoff — Days 8, 9 and 10

Every Claude Code session on this repo has been unable to push commits or open a pull request since Day 3 (a session-level GitHub proxy restriction — see `PROGRESS.md`'s session history for the recurring error). Because of that, three roadmap days' worth of database work has stacked up without review: Day 8 (schema), Day 9 (indexes/roles/RLS) and Day 10 (import staging + CLI importer). This file is the single entry point for reviewing all three in one pass, so Codex does not have to reconstruct the chain from three separate notes documents and two logs before starting.

Read this file first. Each section below links to the day's own detailed notes document for the full verification record and reasoning; this file only summarises.

## How this code reaches you

Each session delivered its work as a `git bundle` (the only delivery mechanism available), written to the project owner's local clone. The most recent one, `day10-importer-sample-load.bundle`, is a superset of the earlier Day 8 and Day 9 bundles — it contains `main` plus all three branches. From the repository root, with the bundle file alongside it:

```bash
git bundle verify day10-importer-sample-load.bundle
git fetch day10-importer-sample-load.bundle \
  'refs/heads/main:refs/heads/bundle-main' \
  'refs/heads/claude/day8-initial-schema-migration:refs/heads/claude/day8-initial-schema-migration' \
  'refs/heads/claude/day9-indexes-roles-rls:refs/heads/claude/day9-indexes-roles-rls' \
  'refs/heads/claude/day10-importer-sample-load:refs/heads/claude/day10-importer-sample-load'
```

(`bundle-main` is just a sanity-check ref confirming the bundle's `main` matches your own — it should be identical to `origin/main` and can be deleted once confirmed.) Push each branch to `origin` yourself once you are ready to open its pull request; this repository's own GitHub access works normally from wherever you are running.

## Review and merge order

The three branches are a **strict linear chain**, not independent work: `main` → `claude/day8-initial-schema-migration` → `claude/day9-indexes-roles-rls` → `claude/day10-importer-sample-load`. Each is a trivial fast-forward of the one before it (confirmed with `git merge-base --is-ancestor` before this handoff was written), and `origin/main` has not moved since Day 7 (`891da72`, "Record Day 7 owner handoff"). That means:

- There is no merge-conflict risk from review order alone.
- Day 9 and Day 10's branches were built **on top of** Day 8 and Day 9 respectively, because each day's work needs the previous day's tables to exist. If you want three separate pull requests (matching this project's usual one-PR-per-day pattern), open and merge them **in order — Day 8, then Day 9, then Day 10** — rather than trying to review Day 10's diff in isolation; its diff against `main` directly would include all three days mixed together.
- If you would rather review this as one combined change, that is a reasonable call too — note it in `PROGRESS.md` either way so the next session knows which shape the history ended up in.

## Day 8 — first schema migration

- Branch: `claude/day8-initial-schema-migration`. Migration: `supabase/migrations/20261012195606_initial_heritage_schema.sql`. Full notes: [`docs/DAY8_MIGRATION_NOTES.md`](DAY8_MIGRATION_NOTES.md).
- Creates 11 enum types and 5 tables (`heritage_objects`, `object_names`, `object_historical_owner_families`, `object_contacts`, `object_cadastre_references`) against `docs/DATA_MODEL.md`'s contract, with RLS enabled everywhere and zero policies yet.
- Five flagged decisions worth a second read: (1) every documented "required field" is `NOT NULL`, making `heritage_objects` itself the publish-ready layer; (2) `object_images`/`object_booking_integrations` deliberately excluded; (3) `historical_owner_families` is one association table, not a master-plus-join pair — **the one most worth a second opinion**, per the notes doc; (4) RLS enabled immediately, policies deferred; (5) only a trivial self-parent `CHECK`, full cycle detection deferred to Day 9.
- Verified against a disposable local Postgres 16 + PostGIS 3.4 instance (every constraint, the generated `location` column, cascade/set-null behaviour, the `updated_at` trigger, and RLS default-deny).

## Day 9 — indexes, roles and Row Level Security

- Branch: `claude/day9-indexes-roles-rls`. Migration: `supabase/migrations/20261019175413_indexes_roles_rls.sql`. Full notes: [`docs/DAY9_MIGRATION_NOTES.md`](DAY9_MIGRATION_NOTES.md).
- Adds every index `docs/DATA_MODEL.md`'s "Index and query requirements" section asks for (GiST, B-tree filters, FK indexes, GIN/trigram), a full multi-level parent/child cycle-detection trigger, and read-only RLS policies for Supabase's built-in `anon`/`authenticated` roles.
- Six flagged decisions: (1)-(2) "roles" means wiring Supabase's existing `anon`/`authenticated`/`service_role`, not inventing a staff-role system — that is explicitly Day 21's job; (3) `object_cadastre_references` given the same public-read policy as other child tables despite no documented public use yet — **worth a second opinion**; (4) GIN/trigram implemented as direct indexes rather than a maintained cross-table search document, deferring that shape to Day 16; (5) the cycle trigger's accepted concurrency limitation (two genuinely concurrent transactions could still race past it); (6) `pg_trgm` installed into `extensions`, matching PostGIS.
- Verified with 8,000 seeded rows: the planner actually chooses every new index (confirmed via `EXPLAIN`), RLS blocks reads/writes correctly per role, contact-visibility gating works, and the cycle trigger rejects both an indirect multi-level cycle and a same-transaction two-statement cycle.

## Day 10 — import staging schema and CLI importer

- Branch: `claude/day10-importer-sample-load`. Migration: `supabase/migrations/20261024173045_import_staging.sql`. Importer: `scripts/import/` (`npm run import --`). Full notes: [`docs/DAY10_IMPORTER_NOTES.md`](DAY10_IMPORTER_NOTES.md).
- Adds `staging_heritage_objects` and `promote_staging_row()`, implementing `docs/DAY6_NORMALIZATION_RULES.md` section 5's four-state staging machine, plus a batched/idempotent/resumable TypeScript CLI that stages a CSV, validates it against `heritage_objects`' own contract, and promotes whatever reaches `ready_for_import`.
- **Key finding, not a bug:** running the importer against the real representative sample (`data/sample/day4-representative-records.csv`) stages all 25 rows as `needs_review` and promotes zero of them, because that CSV has no `summary_lv` column at all and the importer never derives one from the English `summary_research_en` research notes. This matches the Day 4 Codex review's own conclusion that the sample is "a research artifact, not import-ready." Promotion itself was verified end-to-end by simulating an editor completing `summary_lv` directly on three staging rows (see the notes doc) — it correctly promoted a parent and two children with real parent-linking and real family data.
- Nine flagged decisions, most importantly: (2) this importer never does the raw-blog-dataset scope/keyword classification — that is Day 11's job against real raw rows, not this already-curated sample; (3) `summary_lv` is never auto-derived under any circumstance; (6) a row already `imported` is not silently re-staged if its source changes later.
- One real bug was found and fixed during testing (an unused SQL bind parameter Postgres rejected outright) — already fixed in this branch, documented in the notes doc's verification section for transparency.
- Added dependencies: `pg`, `@types/pg`, `csv-parse`, `tsx` (devDependencies only — none of this runs inside the deployed Next.js app).

## Applying all three to the real project, once merged

1. Day 8 and Day 9: paste each migration into the `muizasmanor26-dev` Supabase SQL Editor, in order, the same manual workflow as Day 7's PostGIS setup.
2. Day 10: paste its migration the same way, then set `SUPABASE_DB_URL` in a local `.env.local` (already reserved since Day 7) to the project's **direct** connection string, and run:
   ```bash
   npm run import -- --file data/sample/day4-representative-records.csv --source-system day4_representative_sample --promote
   ```
   Expect the same result documented above: 25 rows staged, all `needs_review`.
3. Have an editor complete `summary_lv` (and, for several rows, missing coordinates/municipality) directly in `staging_heritage_objects` for at least a few rows, set each completed row's status to `ready_for_import`, then re-run the command above with `--promote`. A database constraint prevents an incomplete row from being marked ready.

## One unrelated flag

Codex upgraded Next.js and `eslint-config-next` from 16.4.0 to the patched 16.4.3 release during review after the build gate reported the Image Optimization advisory. The clean build no longer requires a retry.

## After this review

Once all three are merged and applied, and an editor has completed at least a few sample rows' `summary_lv`, the next roadmap step is **Day 11** (issue [#6](https://github.com/EdVialv/muizasmanor26/issues/6)): a real import dry run against the full raw blog dataset, not this curated sample — which means building the scope/keyword classification pass, the per-image row-collapsing logic, and the duplicate/relationship candidate queues that `docs/DAY6_NORMALIZATION_RULES.md` describes and that this sample's already-curated, one-row-per-object shape never exercised. `docs/DAY10_IMPORTER_NOTES.md`'s "Open items" section has the full list.
