-- Day 21: staff roles for the administration area
-- (docs/DAY21_AUTH_PERMISSIONS_NOTES.md).
--
-- Builds on: 20261019175413_indexes_roles_rls.sql (Day 9 grants and RLS),
--            20261113120000_directory_search.sql (the `private` schema).
--
-- Decisions (flagged for review):
--
-- 1. A staff role is a row in public.staff_members, keyed by the Supabase
--    Auth user id. It is the only source of staff access: nothing reads a
--    role from user_metadata (which every user can edit), app_metadata, the
--    JWT or the client. The role is looked up on every request, so revoking
--    access (deleting the row) takes effect at once, without waiting for a
--    token to expire.
--
-- 2. Nobody can grant a role through the application. anon and
--    authenticated get no INSERT, UPDATE, DELETE or TRUNCATE on
--    staff_members, and RLS has no policy for those commands either. Roles
--    are provisioned only by a trusted process: the SQL editor / psql as the
--    database owner, or the service role (which bypasses RLS by Supabase's
--    design and is never used by the app). Day 21 adds no role-management
--    interface.
--
-- 3. Reading staff_members: a signed-in user can read only their own row
--    (so the server can verify the user's role under the user's own
--    permissions - no service-role client); an administrator can read every
--    row. anon reads nothing.
--
-- 4. private.current_staff_role() is SECURITY DEFINER so that policies can
--    look up the current user's role without recursing into staff_members'
--    own RLS. It reads only the caller's own row (auth.uid()), returns null
--    for anyone without a role, has an empty search_path, and is executable
--    only by authenticated.
--
-- 5. Staff (editor and administrator) may read heritage_objects in every
--    status (draft, review, published, archived), through an additional
--    permissive SELECT policy for authenticated. This is the groundwork for
--    the Day 22 admin lists; it does not widen anything for anon or for
--    signed-in users without a role (the Day 9 policy still limits them to
--    published objects). The public pages never send a user session - they
--    use the publishable-key client without cookies - and every public
--    search/map function hard-codes status = 'published', so drafts can
--    never reach a public page, even for a signed-in editor. Child tables
--    (names, families, contacts, cadastre references) keep their Day 9
--    published-parent policies until Day 22 decides what the editor needs.
--
-- 6. No write policies on any content table. Day 22 (editing) and Day 23
--    (draft -> review -> published -> archived) add them, using
--    private.current_staff_role() - see the notes for the planned matrix.

create type public.staff_role as enum ('editor', 'administrator');

comment on type public.staff_role is
  'Day 21: staff roles. editor: edits content (Day 22) and submits it for review (Day 23). administrator: everything an editor can do, plus publishing, archiving and (later) staff administration.';

create table public.staff_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.staff_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Who granted the role and why, for the audit trail (free text: grants
  -- are made outside the application, by a trusted operator).
  note text check (note is null or char_length(note) <= 500)
);

comment on table public.staff_members is
  'Day 21: the trusted source of staff roles. One row per staff user. Written only by trusted operators (SQL editor / service role); the application can only read: a user their own row, an administrator every row.';

create function public.staff_members_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger staff_members_touch_updated_at
  before update on public.staff_members
  for each row
  execute function public.staff_members_touch_updated_at();

revoke all on function public.staff_members_touch_updated_at() from public;

-- ---------------------------------------------------------------------------
-- The current user's role (decision 4)
-- ---------------------------------------------------------------------------

create function private.current_staff_role()
returns public.staff_role
language sql
stable
security definer
set search_path = ''
as $$
  select sm.role
    from public.staff_members sm
   where sm.user_id = (select auth.uid());
$$;

comment on function private.current_staff_role() is
  'Day 21: the calling user''s staff role, or null. SECURITY DEFINER only to avoid RLS recursion in policies; reads the caller''s own row only.';

revoke all on function private.current_staff_role() from public;
grant execute on function private.current_staff_role() to authenticated;

-- ---------------------------------------------------------------------------
-- staff_members: read-only for the application (decisions 2 and 3)
-- ---------------------------------------------------------------------------

alter table public.staff_members enable row level security;

revoke all on public.staff_members from anon, authenticated;
grant select on public.staff_members to authenticated;

create policy staff_members_select_own
  on public.staff_members
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy staff_members_select_by_administrators
  on public.staff_members
  for select
  to authenticated
  using ((select private.current_staff_role()) = 'administrator');

-- ---------------------------------------------------------------------------
-- Staff read every heritage object (decision 5)
-- ---------------------------------------------------------------------------

create policy heritage_objects_select_staff
  on public.heritage_objects
  for select
  to authenticated
  using ((select private.current_staff_role()) is not null);
