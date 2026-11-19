# Day 21 — staff authentication and permissions

Staff can sign in with Supabase Auth and reach a protected `/admin` entry page. Public browsing stays open to everyone, signed in or not. Day 21 adds no editing, publishing or role management: those are Days 22 and 23.

## Baseline

- `main` is `f3311e7`. Days 17–20 are not merged into it.
- Branch `claude/day21-auth-admin`, created from the reviewed Day 20 head `fb46cd0` (`origin/claude/day20-url-state`).
- `4c79149` merges the approved design `origin/codex/travel-guide-design` (`867ffef`, PR #44) into it as a separate merge commit. Neither source branch was changed.
  - Six conflicts in five files were resolved keeping both sides: the explorer frame, the view switch, the filter panel, the Leaflet map and `globals.css`.
  - "Kopēt saiti" sits next to the view switch, styled with the design's toolbar tokens.
- `265fc62` adds two integration fixes found by the browser suites:
  1. **Map resize.** The design's resize handler kept the map's top-left corner, which moved the centre. Opening a shared Day 20 link therefore rewrote its position, and the default view was written into the URL. Resizes now keep the centre, and a sub-pixel difference is never written back.
  2. **Desktop filters.** On desktop, "Filtri" could close the always-open sidebar and hide every filter. A regression test covers it.
- **Integrated baseline: `265fc62`.**
  - Format, lint, typecheck, all tests (53 files, 558), build, `npm audit --omit=dev` (0) and `git diff --check` pass.
  - Browser suites: Day 20 66/66 and 12/12, Day 19 22/22, Day 17 28/28 and 19/19, Day 18 27/27 and 6/6.
  - One Day 17 keyboard step was adapted to the design: on desktop the panel is always open, so the step now checks "Enter leaves it open" instead of "Enter opens it".
- There is no `AGENTS.md` in the repository.

## What existed before

- **No authentication.** `@supabase/supabase-js` was used only by the public, cookie-less read client.
- **Grants and policies (Day 9):** `anon` and `authenticated` had identical rights — read published objects (contacts: public only) and nothing else. There were no write grants and no `auth.uid()` checks.
- The Day 9 migration explicitly left the staff-role design to Day 21.

## Design

### Sessions

- **Session cookies.** `@supabase/ssr` 0.12.7 is the one new dependency. It keeps the Supabase session in cookies (`sb-<ref>-auth-token`), which `@supabase/ssr` itself manages. The app never stores tokens in `localStorage` or `sessionStorage`, and never puts them in a URL.
  - **Attributes** come from one shared configuration, `src/lib/auth/cookies.ts` (`authCookieOptions()`), passed as `cookieOptions` by both the server client and the proxy, so the two cannot drift apart: `path=/`, `SameSite=Lax`, and **`Secure` in production** (`NODE_ENV === "production"`). `@supabase/ssr` does not set `Secure` by itself. Local development over plain HTTP keeps working because `Secure` is off outside production. A production build must therefore be served over HTTPS; browsers treat `localhost`/`127.0.0.1` as secure, so `next start` on the developer's own machine still works (the browser checks below ran that way, and the session cookie was `Secure`).
  - **Not `httpOnly`.** The Supabase SSR session design needs the session cookie to be readable by its browser client, so the configuration never forces `httpOnly` (`@supabase/ssr` keeps `httpOnly: false`). See "Limitations and decisions for review", item 5.
- **Proxy.** `src/proxy.ts` is the Next.js 16 "proxy", formerly middleware. It runs only for `/admin`, `/admin/*` and `/api/admin/*`. It refreshes an expired access token and writes the new cookies; it does not authorise anything. Public routes never read a session and stay cacheable.
- **Server-side check** (`src/lib/auth/session.ts`). Every protected page, route handler and server action calls `loadStaffAccess()` itself:
  1. **Identity:** `auth.getClaims()` verifies the access token — the signature with asymmetric signing keys, or Supabase Auth itself (`getUser`) with symmetric keys. A token that merely decodes is never trusted.
  2. **Role:** read from `public.staff_members` with the user's own token, so Row Level Security returns the user's own row or nothing.
  3. **Default deny.** No row, an unknown role value, a token for a deleted user, or a database or network error each mean no staff access. Errors give "unverified", which is shown as "not available" and returns 503 from the API.
- **Sign-in** (`src/app/admin/actions.ts`): a server action using `signInWithPassword`, for e-mail and password accounts an administrator has created. There is no sign-up action or link. The form works without JavaScript; with JavaScript it shows a pending state, field errors with `aria-invalid`/`aria-describedby`, and an alert that receives focus.
  - One generic message ("Nepareiza e-pasta adrese vai parole.") covers a wrong password, an unknown address and an unconfirmed address (`email_not_confirmed`), so the form never reveals whether an address has an account or what state it is in. Only rate limits and outages, which do not depend on the account, have their own messages.
  - Only the error status and code are logged — never the e-mail address, password or tokens.
- **Return after sign-in** (`src/lib/auth/returnPath.ts`). `next` must be a plain path inside `/admin`.
  - Rejected and replaced with `/admin`: other origins, `//host`, backslashes, schemes, control characters and whitespace, dot-segment escapes, oversized values, public paths, and the sign-in page itself.
- **Sign-out** is a POST server action, so a link or prefetch can never sign anyone out. It uses `scope: "local"`, which ends this browser's session only, then shows "Jūs esat izrakstījies."
- **Session expired.** If a session cookie is present but no longer valid (expired and not refreshable, or revoked), `/admin` sends the user to sign in with "Jūsu sesija ir beigusies".
- **Caching and indexing.** Staff responses are `Cache-Control: private, no-store, max-age=0` and `X-Robots-Tag: noindex, nofollow`. These headers are set by the proxy, by `next.config.ts` for `/admin*` and `/api/admin/*`, and by the API route, which also sends `Vary: Cookie`. The `/admin` layout is `force-dynamic` and has `robots: noindex`.
- **No service-role client anywhere.** Staff reads run under the signed-in user's own permissions, using the same publishable key as the public pages.

### Roles

Migration: **`supabase/migrations/20261119090000_staff_roles.sql`** (new, unapplied).

- **`public.staff_role` enum:** `editor`, `administrator`.
- **`public.staff_members`:**
  - Columns: `user_id` (primary key, references `auth.users`, `on delete cascade`), `role`, `created_at`, `updated_at`, and `note` (who granted the role and why, at most 500 characters).
  - RLS is enabled.
  - `anon` has no privileges.
  - `authenticated` can only SELECT, through two policies:
    - `staff_members_select_own`: a user's own row;
    - `staff_members_select_by_administrators`: every row, for administrators.
  - No INSERT, UPDATE, DELETE or TRUNCATE grant or policy for any API role. Roles are provisioned only by a trusted operator (SQL editor or psql as the database owner, or the service role outside the app).
- **`private.current_staff_role()`:** `SECURITY DEFINER`, `search_path = ''`, `stable`.
  - Returns the caller's own role, or null.
  - Executable by `authenticated` only.
  - It is not in an API-exposed schema; PostgREST answers `PGRST202`.
  - It exists so that policies can check a role without recursing into `staff_members`' own RLS.
- **`heritage_objects_select_staff`:** an additional permissive SELECT policy that lets staff read objects in every status.
  - Nothing changes for `anon` or for signed-in users without a role.
  - Drafts still can't reach a public page: public pages never send a session, and every public search and map function hard-codes `status = 'published'`. The browser suite confirms this for a signed-in editor.
- **Unchanged:** child tables (names, families, contacts, cadastre references) keep their Day 9 published-parent policies. Day 22 decides what an editor needs there.

Nothing reads a role from `user_metadata` (editable by every user), `app_metadata`, the JWT, a URL parameter or client state. Revoking access (deleting the row) takes effect on the next request, even for a token that is still valid.

### Permission matrix

| Who                                | Public directory, map, published objects | `/admin`                                             | `GET /api/admin/session` | Objects in every status (RLS) | `staff_members` (RLS) | Write anything |
| ---------------------------------- | ---------------------------------------- | ---------------------------------------------------- | ------------------------ | ----------------------------- | --------------------- | -------------- |
| Anonymous visitor                  | yes                                      | redirected to sign-in                                | 401                      | no (published only)           | no access             | no             |
| Signed in, no staff role           | yes                                      | "Piekļuve liegta"                                    | 403                      | no (published only)           | 0 rows                | no             |
| Editor                             | yes                                      | role and content overview                            | 200 `editor`             | yes                           | own row               | no (Day 22)    |
| Administrator                      | yes                                      | role, content overview and staff figures (read-only) | 200 `administrator`      | yes                           | every row             | no (Day 22/23) |
| Role cannot be verified (any user) | yes                                      | "Piekļuvi nevarēja pārbaudīt"                        | 503                      | —                             | —                     | no             |

### Days 22 and 23

`src/lib/auth/roles.ts` already names the permissions, so the interfaces have one place to ask:

| Permission                  | Editor | Administrator | Enforced by                           |
| --------------------------- | ------ | ------------- | ------------------------------------- |
| `admin.access`              | yes    | yes           | Day 21: page checks + RLS read policy |
| `objects.edit`              | yes    | yes           | Day 22                                |
| `objects.submit_for_review` | yes    | yes           | Day 23                                |
| `objects.publish`           | no     | yes           | Day 23                                |
| `staff.read`                | no     | yes           | Day 21: RLS (read-only figures)       |

- **Day 22 (editing)** adds INSERT and UPDATE policies on `heritage_objects` and the child tables for `authenticated` with `(select private.current_staff_role()) is not null`. A `WITH CHECK` keeps `status` in `draft`/`review` for editors. Every server action calls `loadStaffAccess()` and `hasPermission(role, "objects.edit")`, and the database enforces the same rule. Admin lists use cursor pagination, as the public directory does.
- **Day 23 (publication)** moves status changes into SECURITY DEFINER functions (or policies) that check the transition and the role: an editor may go `draft → review`; only an administrator may go `review → published` and `published → archived`. Each records audit metadata (`auth.uid()`, time, previous and new status).
- **Role management** stays SQL-only until a later day decides otherwise, and then it will also be an administrator-only database function, not a table grant.

## Account setup

No passwords, real user ids or keys are committed. Nothing in this section was run against a live project.

### Environment variables

No new ones. The app uses the existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `SUPABASE_SECRET_KEY` is not used by the application.

### Supabase Auth settings (dashboard: Authentication)

1. **Sign In / Providers → Email:** enabled.
2. **Allow new users to sign up: off.** Staff accounts are created by an administrator. Even with sign-up on, a new user would have no role and see only public pages, but turning it off avoids unused accounts.
3. **Confirm email: on** (accounts created in the dashboard with "Auto confirm" are confirmed). An unconfirmed account cannot sign in, and the form shows it only the generic failure message — so if a new staff member cannot sign in, check that their account is confirmed.
4. **URL Configuration:**
   - **Site URL:** the production origin.
   - **Additional Redirect URLs:** each environment's origin, including `http://localhost:3000/**` for development and preview domains.
   - E-mail and password sign-in itself needs no redirect, but password-reset and invitation e-mails do.
5. **Optional:** set the JWT expiry (default 3600 s), and turn on leaked-password protection and a minimum password length (12+) under Attack Protection.

### First administrator (trusted process)

1. In the Supabase dashboard, **Authentication → Users → Add user**: their e-mail address, a strong temporary password, and "Auto confirm user". Or use "Send invitation".
2. Copy the new user's UUID from the user list.
3. In the **SQL editor** (database owner), run:

   ```sql
   insert into public.staff_members (user_id, role, note)
   values ('<user-uuid>', 'administrator', 'First administrator, granted by <operator> on <date>');
   ```

4. The administrator signs in at `/admin/sign-in` and changes the temporary password (via a password-reset e-mail until a change-password page exists).

### Adding an editor, changing or revoking a role

```sql
-- Add an editor (create the user first, as above)
insert into public.staff_members (user_id, role, note)
values ('<user-uuid>', 'editor', 'Granted by <operator> on <date>: <reason>');

-- Change a role
update public.staff_members set role = 'administrator', note = '<who/when/why>' where user_id = '<user-uuid>';

-- Revoke staff access (takes effect on the next request)
delete from public.staff_members where user_id = '<user-uuid>';
```

To also end a revoked user's sessions everywhere, delete or ban the user in **Authentication → Users**. Deleting the user removes the `staff_members` row through `on delete cascade`.

### Testing with separate accounts

Use a development or preview project, never production:

1. Create three users: `admin-test@…`, `editor-test@…` and `visitor-test@…`. Give `visitor-test` a `user_metadata` of `{"role": "administrator"}` to prove that metadata grants nothing.
2. Insert the administrator and editor rows as above, and none for the visitor.
3. Check `/admin`, `/api/admin/session` and the public pages for each account, plus a signed-out browser. The expected results are in the permission matrix.
4. Run `supabase/tests/staff_roles.test.sql` against a disposable local database. On plain PostgreSQL, apply `supabase/tests/support/local_auth_schema_stub.sql` before the migrations; it refuses to run where an `auth` schema exists.

### Applying the migration

Apply `20261119090000_staff_roles.sql` after the Day 15–19 migrations. Then provision the first administrator: until a row exists, everyone is denied.

## Verification

**Mocked (Vitest; jsdom or Node):** 53 → 67 test files, 558 → 643 tests; format, lint, typecheck, build, `npm audit --omit=dev` (0) and `git diff --check` pass.

- `safeReturnPath` with 18 unsafe inputs.
- Role parsing and the permission matrix.
- `getStaffSession` with a fake client: anonymous and expired sessions, claims that are not an authenticated user, metadata role claims ignored, unknown role values, errors treated as unverified.
- Sign-in validation and failure messages.
- The server actions: validation before any Supabase call, success, unsafe `next`, a generic message with no credentials logged (also for an unconfirmed address), an unreachable auth service, sign-out.
- `/admin` and `/admin/sign-in` for every session kind.
- The sign-in form's accessibility.
- `GET /api/admin/session`: 401, 403, 503 and 200, plus the cache headers.
- The proxy: matcher, never redirects, writes refreshed cookies, survives outages, and passes the shared cookie configuration to the Supabase client (`Secure` only in production).
- The server client: the same shared cookie configuration, session-cookie detection, cookie writes, and the ignored write from a Server Component.
- The cookie configuration itself, and — with the real `@supabase/ssr` and a stubbed auth response — that a stored session cookie is written with `path=/`, `SameSite=Lax`, `httpOnly: false`, and `Secure` exactly in production. These tests fail if `Secure` is not set in production.
- `next.config` private headers.

**Real local PostgreSQL** (`supabase/tests/staff_roles.test.sql`):

- Every role checked as the database's own API roles.
- The complete write matrix on `staff_members` — INSERT, UPDATE, DELETE and TRUNCATE — for anon, a signed-in non-staff user, an editor and an administrator: every one is denied. (TRUNCATE is checked separately because Row Level Security does not apply to it; only the missing grant stops it.)
- Self-grant and self-escalation attempts by non-staff, editor and administrator; an administrator cannot revoke a role through the API either.
- Metadata role claims, revocation, deleted users and unknown roles.
- Called as an editor (who can read draft and review rows directly), every public object-derived function stays published-only: `search_public_heritage_objects` and `public_map_objects` return only the published fixture; `public_directory_municipalities` offers no draft-only or review-only municipality and does not count a draft in a published municipality; `public_directory_historical_families` offers no family linked only to draft/review objects and does not count drafts.
- All committed SQL tests (`directory_family_names`, `directory_map`, `staff_roles`) pass on a fresh disposable PostgreSQL 16 + PostGIS 3.4 database with the auth stub and every migration applied; the database was dropped afterwards.
- Mutation checks make the test fail as it should: granting INSERT on `staff_members`; granting TRUNCATE to `authenticated`; removing the `status = 'published'` filter from `public_directory_municipalities`.

**Real local PostgREST + PostgreSQL**, with JWTs from a local auth stub signed with the secret PostgREST verifies — 20/20:

- anon, non-staff (with an "administrator" claim in `user_metadata`), editor and administrator.
- A forged token claiming `service_role` → 401.
- Insert, update and delete attempts on `staff_members` → `42501`.
- Content writes → `42501`.
- The `private` helper is not exposed over the API.
- A still-valid token loses access the moment the role row is deleted.

**Browser** (Chromium, production build), app → local **auth stub** + real PostgREST: 55/55, desktop 1280×900 and mobile 390×844.

- Anonymous `/admin` → sign-in, with private/noindex headers and no sign-up offered.
- Validation and wrong-password states.
- An editor signs in despite an unsafe `next` and lands on `/admin` with the role and draft counts, and no staff figures.
- API 200/401/403.
- No tokens in local or session storage or in any URL; the session lives in a `SameSite=Lax` cookie.
- Public search and directory unchanged, and drafts hidden from a signed-in editor's public views.
- Sign-out notice; afterwards `/admin` and the API deny, and Back doesn't show the staff page.
- The administrator sees the read-only staff figures.
- Revoked sessions → "sesija ir beigusies".
- The non-staff user → "Piekļuve liegta" and 403.
- Sign-in and sign-out without JavaScript.
- Keyboard order and visible focus.

Screenshots: `docs/day21-screenshots/`.

**Regressions on the Day 21 build:** Day 20 66/66 and 12/12, Day 19 22/22, Day 17 28/28 and 19/19, Day 18 27/27 and 6/6.

**Blocked, not passed:**

- **Real Supabase Auth.** The GoTrue server can't be downloaded here: GitHub and the Go module proxy are blocked from this sandbox. The browser checks use a stub of the four Auth endpoints the app calls (password grant, refresh, `/user`, logout). Whether `@supabase/ssr` and `getClaims()` behave the same against the real Auth server — especially with asymmetric signing keys (JWKS) — must be checked on a development project.
- **Live project settings:** dashboard settings, redirect URLs, e-mail delivery, rate limits.
- **Browsers other than Chromium.**

## Limitations and decisions for review

1. **The role is read on every request** (one indexed primary-key read under RLS), rather than placed in the JWT by an access-token hook. This keeps revocation immediate and the trust source in one table. A custom-claims hook could replace it later if latency matters.
2. **Access denied returns HTTP 200.** The page shows "Piekļuve liegta"; the API returns 403. A 403 for the page needs Next's experimental `forbidden()`/`authInterrupts`, which was left off.
3. **No password reset or change page yet.** Use Supabase's reset e-mail. A reset page needs a redirect route and is best added with Day 22's account work.
4. **Sign-out ends the local session only.** To end every session of a user, an administrator uses the dashboard.
5. **The Supabase session cookie is readable by JavaScript** (not `httpOnly`). This is how `@supabase/ssr` works. No app code reads or stores it; XSS protection remains essential, and nothing in the app renders untrusted HTML. It is `SameSite=Lax`, and `Secure` in production, so it is never sent over plain HTTP there.
6. **The local auth stub** (in the scratchpad, not committed) is a test double, not a product component.
