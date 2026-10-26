# Day 9 — indexes, roles and Row Level Security

This is the Day 9 deliverable from `TODO.md`: spatial/search/filter indexes, the remaining hierarchy constraint, database roles and Row Level Security policies on top of Day 8's schema, at [`supabase/migrations/20261019175413_indexes_roles_rls.sql`](../supabase/migrations/20261019175413_indexes_roles_rls.sql). The migration file carries a detailed header comment with the same decisions below, inline at the point they matter; this document is the session-level summary and test record.

This migration is based on `claude/day8-initial-schema-migration` (`20261012195606_initial_heritage_schema.sql`), not on `main`, because it adds indexes and policies to tables that migration creates and that branch has not been merged yet. Once Day 8 is merged, this branch rebases cleanly onto `main`, since the Day 8 content will be identical to what is already in this branch's history.

## What this migration creates

- `pg_trgm`, installed into the dedicated `extensions` schema (same reasoning as PostGIS in Day 7/8: keep `public`'s Data API surface free of extension-owned objects).
- The spatial, filter and foreign-key indexes `docs/DATA_MODEL.md`'s "Index and query requirements" section asks for: a GiST index on `location`; B-tree indexes on `status`, `object_type`, `municipality`, `condition_category`, `ownership_type` and `parent_object_id`; a B-tree index on every child table's `object_id` foreign key; and GIN/trigram indexes on `heritage_objects.name_lv`, `heritage_objects.municipality` and `object_names.name`.
- `prevent_hierarchy_cycle()` — a trigger function that walks the full `parent_object_id` ancestor chain on insert/update, replacing Day 8's direct-self-parent-only `CHECK` as the active guard (that `CHECK` is still in place and still passes, but this trigger now catches every case it did and more, since it fires first).
- Grants and Row Level Security policies for Supabase's built-in `anon` and `authenticated` roles: read-only access to published heritage objects and their associated names, historical-owner-family associations and cadastre references, plus `object_contacts` rows that are additionally marked `visibility = 'public'`. No insert/update/delete policy exists anywhere in this migration.

## Decisions made while writing this (flagged for Codex review)

1. **"Roles" means wiring grants/policies for Supabase's existing `anon`/`authenticated`/`service_role` roles, not inventing a staff role system.** `TODO.md`'s Day 21 entry is the one that "defines administrator and editor permissions"; there is no login, profile table or claim yet to tell an editor apart from an ordinary visitor, so building that distinction now would mean guessing at a shape Day 21 should decide. `service_role` bypasses RLS by Supabase's own design, so every write path (Day 10's importer today, Day 22's admin forms later) continues through it — this migration adds no write policy on any table.
2. **`anon` and `authenticated` get identical read access for now.** Until Day 21 exists, there is no column distinguishing a signed-in visitor from staff, so `authenticated` is deliberately treated exactly like `anon` rather than guessing at a broader grant.
3. **`object_cadastre_references` uses the same "published parent only" read policy as the other child tables**, even though no documented page currently plans to display cadastral references publicly. `docs/DATA_MODEL.md` treats it as reference/verification metadata without saying whether it is public or private. Flagged for Codex review; tightening to `service_role`-only is a one-line change later if product decides it should not be public.
4. **The GIN/trigram search requirement is implemented as direct trigram indexes**, not a maintained cross-table "search document" column. `docs/DATA_MODEL.md` describes one maintained document spanning `heritage_objects` and `object_names`, but the real query shape (`JOIN` vs `UNION` vs a trigger-maintained denormalized column) should be driven by Day 16's actual search implementation. These three indexes let Day 16 query either shape without a migration just to add indexes.
5. **Cycle detection cannot fully prevent a cycle assembled by two genuinely concurrent transactions** that each pass their check before either commits — a known limitation of a trigger-based check without explicit locking or `SERIALIZABLE` isolation. It does correctly block a cycle built within a single transaction (verified below). Hierarchy edits are a rare, low-concurrency admin operation, and decision 1 means there is no public write path at all yet, so this is accepted rather than engineered around with locking now.
6. **`pg_trgm` goes into the `extensions` schema**, matching PostGIS, for the same Data-API-surface reason.

## Verification performed

Same methodology as Day 8 — no live Supabase credentials exist in this session, so this was verified against a disposable local Postgres 16 instance with PostGIS and `pg_trgm` installed into a dedicated `extensions` schema, with `anon`, `authenticated` and `service_role` roles created locally to mirror what a real Supabase project already provisions (`service_role` created with `BYPASSRLS`, matching Supabase's actual role):

- Applied the Day 8 migration, then this Day 9 migration, in sequence with `psql -f`; both applied without error.
- Confirmed all 14 new indexes exist (`pg_indexes`), matching every index `docs/DATA_MODEL.md`'s "Index and query requirements" section asks for, plus the four foreign-key indexes.
- Seeded 8,000 rows with varied `municipality`/`object_type`/`status` and ran `EXPLAIN` on representative queries: a `status` filter used `heritage_objects_status_idx`; a `municipality` + `object_type` filter used `heritage_objects_object_type_idx`; an `ILIKE` name search used `heritage_objects_name_lv_trgm_idx`; a spatial bounding-box query (`&&` against a `ST_MakeEnvelope` geography) used `heritage_objects_location_gist_idx`; a child-table lookup by `object_id` used the new `object_contacts_object_id_idx`.
- Confirmed RLS: `anon` and `authenticated` each saw only the 2,000 `published` rows out of 8,000 seeded rows across all four statuses; `service_role` (granted table privileges the same way Supabase's platform grants them, separately from this migration) saw all 8,000 rows, confirming its RLS bypass.
- Confirmed write denial: both `anon` and `authenticated` got `insufficient_privilege` on an `INSERT` and an `UPDATE` respectively against `heritage_objects`.
- Confirmed `object_contacts` visibility gating: seeded one published object with one `public` and one `internal` contact, and one `draft` object with a `public` contact; `anon` saw exactly one row — the public contact on the published object — confirming both the `visibility = 'public'` condition and the published-parent condition are enforced together.
- Confirmed cycle detection: a valid three-level chain (`C → B → A`) succeeded; closing it into a cycle (`A → C`, which would complete `A → C → B → A`) was rejected; a two-statement cycle attempted within a single transaction (`D → E` then, in the same transaction, `E → D`) was rejected on the second statement, and the transaction was rolled back cleanly; a direct self-parent update was rejected (now caught by the new trigger before Day 8's `CHECK` constraint is even reached, since the trigger fires first and a self-parent is a trivial one-step cycle).
- Dropped the scratch database and the three mirrored roles afterward; nothing from this test run persists anywhere.
- Ran this project's standard checks (`npm run format:check`, `lint`, `typecheck`, `test`, `build`) — all passed, since this change is SQL-only and touches no application code.

## Applying this to the real project

Once Day 8 is merged and applied, apply `supabase/migrations/20261019175413_indexes_roles_rls.sql` the same way: paste it into the Supabase SQL Editor, or `supabase db push` once CLI setup exists for this repo (still an open item — see below).

## Open items carried to Day 10+

- `object_images`, per the proposal in `docs/DAY6_NORMALIZATION_RULES.md` section 6 — needed before Day 10's importer loads the representative sample.
- The staging/review schema implied by `docs/DAY6_NORMALIZATION_RULES.md` section 5's state machine — belongs with Day 10's importer design, not guessed at here.
- Supabase CLI setup (`supabase/config.toml` etc.) for a `supabase db push` workflow, if the project wants one — not yet created.
- Real administrator/editor roles and the RLS policies that depend on them (`TODO.md` Day 21) — decisions 1 and 2 above are explicitly placeholders until then.
- Whether `object_cadastre_references` should be public at all (decision 3) — a product call, not a technical one.
- Composite/partial indexes beyond what is here should follow measured query plans from the real application once it exists, per `docs/DATA_MODEL.md`'s own instruction not to speculate on those.
