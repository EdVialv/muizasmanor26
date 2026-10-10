# Supabase and PostGIS setup (Day 7)

This is the Day 7 deliverable from `TODO.md`: create the development Supabase project, enable PostGIS, and document safe local and hosted configuration. Project creation and credential retrieval are manual steps for the project owner — no AI agent session should ever hold or type Supabase account credentials. Day 8 ("Write the first migration...") starts from the project this document sets up; this document does not write any migration or install a database client itself.

## Why this is a manual step

Creating the Supabase account/project and reading its API keys happens inside the Supabase dashboard, under the project owner's own login. No assistant session should sign up for third-party services, accept their terms, or hold real credentials — that stays with the account owner. The checklist below is written so the owner (or anyone with dashboard access) can complete it in a few minutes, then hand the already-redacted result (names only, confirmed working — never pasted key values) back to either agent.

## 1. Create the development project

1. Sign in at [supabase.com](https://supabase.com) (create an account first if needed — this is the one part of this checklist that cannot be scripted or delegated).
2. Create a **new project** named `muizasmanor26-dev` — a name that makes clear it is the shared development/local database, separate from whatever production project is created later per `docs/ARCHITECTURE.md`'s environment split ("Never reuse the production Supabase service-role key in local or preview environments"). Creating the production project itself is not scheduled in `TODO.md` yet; do not create it now just because the step is easy — a second, confusing "production" project with no later owner is worse than deferring it to whichever day actually needs it.
3. **Region:** choose the specific **Central EU (Frankfurt), `eu-central-1`** region. A specific EU region keeps the primary project data in the selected jurisdiction; do not confuse this location control with proof of GDPR compliance.
4. The free plan is sufficient for this development setup; reassess capacity, backups and support before production.
5. Generate and store the project's database password using Supabase's own generator, saved only in the owner's password manager — never in this repository, chat or `PROGRESS.md` (an existing coordination rule already forbids secrets in `PROGRESS.md`).

## 2. Enable PostGIS

`docs/DATA_MODEL.md` requires coordinates stored as `geography(Point, 4326)` with a GiST index, which needs the PostGIS extension enabled before Day 8's migration can create that column type.

1. In the project dashboard, open **Database → Extensions**.
2. Search for `postgis` and enable it. In the confirmation prompt, install it into the dedicated `extensions` schema, **never `public`**. Installing PostGIS in `public` exposes its `spatial_ref_sys` reference table through the Data API and is disruptive to correct later.
3. If using the **SQL Editor** instead of the dashboard, run:

   ```sql
   create schema if not exists extensions;
   create extension if not exists postgis with schema extensions;
   ```

   This is safe to rerun when the extension is already installed in `extensions`. It does not relocate an extension previously installed in another schema.

4. **Verify** with this query in the SQL Editor:

   ```sql
   select extensions.postgis_version();
   ```

   It should return a version string (e.g. `3.x.x ...`) rather than an error. As a second check that exercises the actual type Day 8 will use, confirm a geography point for Riga parses correctly:

   ```sql
   select extensions.st_astext(
     extensions.st_setsrid(extensions.st_makepoint(24.1052, 56.9496), 4326)::extensions.geography
   ) as riga_point;
   ```

   Expect `POINT(24.1052 56.9496)` back. If either query errors, PostGIS is not enabled yet — re-check step 2 rather than proceeding to Day 8.

## 3. Retrieve the values this project needs (names only go in Git)

Open the project's **Connect** dialog to retrieve the Project URL and a publishable key (`sb_publishable_...`). Supabase is deprecating the legacy `anon` and `service_role` keys by the end of 2026, so do not start this new project with those legacy keys. If a server-only privileged client is later required, create or retrieve a secret key (`sb_secret_...`) under **Settings → API Keys**.

The same **Connect** dialog provides database connection strings. Save the direct connection for migrations and the transaction-pooler connection for a future Vercel/serverless runtime. The direct endpoint is IPv6 unless the paid IPv4 add-on is enabled; use the session pooler when a migration environment is IPv4-only. Day 8 will select the migration client and exact runtime variables.

Do **not** copy any of these values into this repository, into chat with either agent, or into `PROGRESS.md`. They belong only in a local `.env.local` file (already covered by `.gitignore`'s `.env.*` rule, with `.env.example` as the sole tracked exception) and, once hosting is configured (`TODO.md` Day 27), in Vercel's own encrypted environment-variable settings — never in a file this repository tracks.

## 4. Local configuration

`.env.example` (tracked, names only) now reserves these variables for the Supabase integration added in Day 8+:

- `NEXT_PUBLIC_SUPABASE_URL` — the project URL; safe to expose to browser code, hence the `NEXT_PUBLIC_` prefix.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the current public key format (`sb_publishable_...`); safe for browser code because Row Level Security (mandatory per `docs/ARCHITECTURE.md`) protects data, not key secrecy.
- `SUPABASE_SECRET_KEY` — current server-only key format (`sb_secret_...`) for a future privileged backend client. It bypasses Row Level Security, must never carry the `NEXT_PUBLIC_` prefix and must never reach browser-bundled code. Do not create or use it until a server-side feature requires it.
- `SUPABASE_DB_URL` — the direct Postgres connection string, for migrations and server-side scripts. Day 8 will decide the specific migration tool and may add a second pooled-connection variable alongside this one if that tool needs it; this document reserves the name, not the tool choice.

To work locally: copy `.env.example` to `.env.local`, fill in the real values retrieved in §3, and never commit `.env.local` (already blocked by `.gitignore`). Each contributor — including whichever agent session has local file access at the time — uses their own `.env.local` pointing at the shared `muizasmanor26-dev` project; nobody commits or pastes its contents anywhere.

## 5. Hosted configuration (forward reference)

`docs/ARCHITECTURE.md` already defines three environments: local, Vercel preview (one per pull request) and production. Preview and production environment variables are configured directly in Vercel's dashboard once Day 27 sets up Vercel — not before, and not in this repository. This section exists so Day 27 does not have to rediscover the variable names: it reuses the same four names from §4, pointed at whichever Supabase project each environment should use (preview typically reuses the development project; production uses its own project, created when that day's work begins).

## 6. Handoff checklist for the next session

Before Day 8 starts, confirm:

- [ ] The `muizasmanor26-dev` Supabase project exists.
- [ ] `select extensions.postgis_version();` returns a version, not an error, and PostGIS is installed in the `extensions` schema.
- [ ] `.env.local` exists locally (untracked) with real values; `.env.example` in Git has only the four names above, no values.
- [ ] No Supabase key or password appears anywhere in `PROGRESS.md`, `TODO.md`, a commit message, or chat history with either agent.

Once those are checked, Day 8 ("Write the first migration for heritage objects, hierarchy, classifications, contacts, sources and families") can proceed using `docs/DATA_MODEL.md` as the schema contract and `docs/DAY6_NORMALIZATION_RULES.md` as the agreed import scope and rules.
