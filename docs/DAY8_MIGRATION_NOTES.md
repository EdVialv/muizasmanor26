# Day 8 — first schema migration

This is the Day 8 deliverable from `TODO.md`: the first migration for heritage objects, hierarchy, classifications, contacts, sources and families, at [`supabase/migrations/20261012195606_initial_heritage_schema.sql`](../supabase/migrations/20261012195606_initial_heritage_schema.sql). The migration file itself carries a detailed header comment with the same decisions below, inline at the point they matter; this document is the session-level summary and test record.

## What this migration creates

- 11 enum types matching `docs/DATA_MODEL.md`'s documented allowed values exactly (`object_type`, `object_status`, `condition_category`, `ownership_type`, `cadastre_reference_type`, `cadastre_match_method`, `contact_type`, `contact_purpose`, `contact_visibility`, `object_name_type`, `verification_status`).
- `heritage_objects` — the core table, with hierarchy (`parent_object_id`) and classification fields (`condition_category`, `ownership_type`, etc.) inline, exactly as `docs/DATA_MODEL.md` describes them.
- `object_names` — alternate/historical name candidates, per `docs/DAY6_NORMALIZATION_RULES.md` section 2 and its "Open items" note that this table "must be included in the Day 8 migration."
- `object_historical_owner_families` — the family/dynasty association relation from `docs/DATA_MODEL.md`'s "Historical owner families" section.
- `object_contacts` — per `docs/DATA_MODEL.md`'s "Contact information" section.
- `object_cadastre_references` — per `docs/DATA_MODEL.md`'s "Cadastral cross-references" section, with the exact `(object_id, reference_type, reference_value)` uniqueness rule that document specifies.
- A shared `set_updated_at()` trigger function, attached to every table, satisfying `docs/DATA_MODEL.md`'s "`created_at` and `updated_at` are required for audit and cache invalidation."
- Row Level Security enabled on every table, with **no policies yet** — every table is fully locked to Supabase's Data API until Day 9 adds policies.

## Decisions made while writing this (flagged for Codex review)

1. **`heritage_objects` enforces every documented "required field" as `NOT NULL`** (`name_lv`, `slug`, `summary_lv`, `municipality`, `latitude`, `longitude`, `source_url`, `last_verified_at`, `object_type`, `status`). This makes the table itself the canonical/published-track layer: a record that doesn't yet satisfy `docs/DATA_MODEL.md`'s contract cannot be inserted here at all. `docs/DAY6_NORMALIZATION_RULES.md` section 5 asks for exactly this ("must not silently create a canonical object that violates the contract") and separately describes a staging state machine (`archived_out_of_scope` / `needs_review` / `ready_for_import` / `imported`) for everything that doesn't yet qualify. That staging schema is **not** created in this migration — it belongs with Day 10's importer, which needs to co-design its shape with the actual import code rather than have it guessed at in isolation today.
2. **`object_images` and `object_booking_integrations` are deliberately excluded.** `TODO.md`'s Day 8 entry scopes this migration to "heritage objects, hierarchy, classifications, contacts, sources and families" only. `object_images` is still an explicit "proposal" in `docs/DAY6_NORMALIZATION_RULES.md` section 6, not yet folded into `docs/DATA_MODEL.md`'s own reviewed contract — it's needed before Day 10 ("load the representative sample"), not before Day 8. `object_booking_integrations` is a post-validation module per `docs/MVP_SCOPE.md` and isn't scheduled anywhere in the 30-evening roadmap yet.
3. **`historical_owner_families` is one association table, not a master-table-plus-join-table pair.** `docs/DATA_MODEL.md`'s own wording lists the family/dynasty name itself as a per-association attribute ("Each association supports: family or dynasty name; alternate spellings; ...") rather than describing a separate normalised family registry with its own schema. There's nothing documented to build a master table against, so `object_historical_owner_families` carries `family_name` and `alternate_spellings` directly. This is a judgement call, not a documented requirement — worth Codex's independent read.
4. **RLS is enabled immediately, on every table, with zero policies**, rather than deferring the `ENABLE ROW LEVEL SECURITY` statement itself to Day 9. `docs/ARCHITECTURE.md` calls RLS "a mandatory boundary, not an optional hardening step"; this avoids any moment where a table exists without it. Day 9 ("roles and Row Level Security") adds the actual policies.
5. **Cycle prevention is only a direct self-parent `CHECK`** (`id <> parent_object_id`), not full multi-level cycle detection. `TODO.md`'s Day 9 entry explicitly lists "constraints" alongside indexes and RLS, so the complete guard (which needs either a recursive trigger or periodic validation) is deferred there rather than added speculatively now.

## Verification performed

This session has no live Supabase project credentials and shouldn't hold any (per `docs/SUPABASE_SETUP.md`), so the migration was verified against a disposable local Postgres instance instead of guessed at from the SQL alone:

- Installed PostgreSQL 16 and the `postgresql-16-postgis-3` package locally, then created a scratch database with PostGIS installed into a dedicated `extensions` schema — matching the real project's actual configuration from Day 7, not the `public`-schema default.
- Applied the migration with `psql -f`: all 11 enum types, the shared trigger function, and all 5 tables with their comments, triggers and `ENABLE ROW LEVEL SECURITY` statements were created without error.
- Inserted a parent (`manor_estate`) and a child (`park_or_garden`, via `parent_object_id`) row and confirmed the generated `location` column correctly produced `POINT(24.1052 56.9496)` from `latitude`/`longitude` — the schema-qualified `extensions.st_makepoint`/`extensions.st_setsrid` expression works against the `extensions`-schema PostGIS install.
- Confirmed every constraint actually rejects bad data: direct self-parenting, a duplicate `slug`, a duplicate `(source_system, external_source_id)` pair, an out-of-range latitude (999), a missing required field (`summary_lv`), a duplicate `(object_id, reference_type, reference_value)` cadastre reference, and an `end_year_approx` before `start_year_approx`.
- Inserted one row into each child table (`object_names`, `object_contacts`, `object_cadastre_references`, `object_historical_owner_families`) for the parent object, then deleted the parent and confirmed all four child rows cascaded away (`on delete cascade`) while the separately-created child heritage object's `parent_object_id` became `null` rather than being deleted itself (`on delete set null`).
- Confirmed the `updated_at` trigger actually fires: `updated_at` changed on an `UPDATE`, `created_at` did not.
- Confirmed RLS actually blocks access: created an unprivileged role, granted it table-level `SELECT`, and — using `SET ROLE` inside the same session to avoid an unrelated peer-authentication wrinkle in the local test setup — confirmed it sees `0` rows from `heritage_objects` with no policies defined, exactly as decision 4 above intends.
- Dropped the scratch database and role afterward; nothing from this test run persists anywhere.
- Ran this project's standard checks (`npm run format:check`, `lint`, `typecheck`, `test`, `build`) — all passed, since this change is SQL-only and touches no application code.

## Applying this to the real project

Once reviewed, apply `supabase/migrations/20261012195606_initial_heritage_schema.sql` to the `muizasmanor26-dev` project either by pasting its contents into the Supabase SQL Editor (same manual workflow as Day 7's PostGIS setup) or via `supabase db push` once the Supabase CLI is set up for this repo — that CLI setup itself hasn't happened yet and isn't scheduled by name in `TODO.md`, so it's noted here as an open item rather than done speculatively today.

## Open items carried to Day 9+

- RLS policies and database roles (`TODO.md` Day 9).
- Full multi-level parent/child cycle detection (`TODO.md` Day 9, "constraints").
- Spatial/search/filter indexes: the GiST index on `location`, B-tree indexes on `status`/`object_type`/`municipality`/`condition_category`/`ownership_type`/`parent_object_id`, and the GIN/trigram search index (`TODO.md` Day 9; `docs/DATA_MODEL.md`'s "Index and query requirements" already specifies these).
- `object_images`, per the proposal in `docs/DAY6_NORMALIZATION_RULES.md` section 6 — needed before Day 10's importer loads the representative sample.
- The staging/review schema implied by `docs/DAY6_NORMALIZATION_RULES.md` section 5's state machine — belongs with Day 10's importer design, not guessed at here.
- Supabase CLI setup (`supabase/config.toml` etc.) for a `supabase db push` workflow, if the project wants one — not yet created.
