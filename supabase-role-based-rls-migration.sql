-- MMDI ONE — role-based access control (admin / editor / viewer)
-- Generated 15 July 2026. Run this in the Supabase SQL Editor
-- (Project: mahin-aeroai's Project, https://vzyrvzgtjcodxkjydxxn.supabase.co).
--
-- WHAT THIS CHANGES
-- Until now, every signed-in user could read AND write every table
-- (supabase-auth-rls-migration.sql's "authenticated-only" model). This
-- migration adds three roles:
--   - viewer: read-only everywhere
--   - editor: read + insert/update everywhere, but cannot delete
--   - admin:  read + insert/update + delete everywhere, plus can manage
--             other users' roles
-- This is uniform across all tables — no department/region scoping (that
-- was explicitly the option NOT chosen).
--
-- HOW IT WORKS
-- 1. A new `profiles` table (one row per auth user: id, email, role).
-- 2. A `public.user_role()` SQL function (security definer, so it can read
--    `profiles` regardless of the caller's own RLS visibility into that
--    table — the standard pattern for this in Supabase, avoids recursive
--    RLS policy evaluation).
-- 3. A trigger on `auth.users` that auto-inserts a `profiles` row
--    (default role: 'viewer', the safe default) whenever a new user is
--    created — covers people invited after this migration runs.
-- 4. A backfill for users who already exist (created before this
--    migration) — inserted as 'viewer' by default.
-- 5. One explicit bootstrap: m.nandipa@icloud.com is set to 'admin' so
--    there's at least one admin able to promote everyone else via the SQL
--    editor or (once built) an admin UI. (CONFIRMED RUN IN PRODUCTION on
--    15 July 2026 — originally bootstrapped srinivas@mmdi.in, which turned
--    out not to match any real Supabase Auth user, so nobody got promoted;
--    corrected by running `update public.profiles set role = 'admin'
--    where email = 'm.nandipa@icloud.com';` directly, and this file was
--    updated afterwards to match reality.) **If that's not the right
--    person/email to be the first admin, change the email in STEP 5
--    before running, or update it manually afterwards**: `update
--    public.profiles set role = 'admin' where email = '<correct email>';`
-- 6. Every existing table's policies are replaced (drop + recreate, same
--    idempotent pattern as the previous RLS migration) with role-aware
--    versions: SELECT for any of the 3 roles, INSERT/UPDATE for
--    admin+editor, DELETE for admin only.
--
-- IMPORTANT: this SUPERSEDES supabase-auth-rls-migration.sql's policies on
-- every table it touches (drops and replaces them). Safe to re-run this
-- file itself any number of times.
--
-- Validated against a real local Postgres instance (PGlite) with a stub
-- `auth.users`/`auth.uid()` before being handed off — confirmed: viewers
-- can select but not insert/update/delete, editors can select/insert/
-- update but not delete, admins can do everything, a signed-in user with
-- no profile row is denied everywhere (fail-closed), the auto-create
-- trigger fires on new `auth.users` rows, and the whole file is idempotent
-- on a second run.

-- ============================================================
-- STEP 1 — profiles table
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own_or_admin on public.profiles;
drop policy if exists profiles_insert_admin on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
drop policy if exists profiles_delete_admin on public.profiles;

-- Anyone signed in can read their own profile (so the app can show their
-- role); admins can read everyone's (needed for any future user-management
-- UI). NOTE: this policy references public.user_role(), defined in STEP 2
-- below — profiles must exist before that function, but the function must
-- exist before this policy is created, so STEP 2 is deliberately placed
-- before this policy is applied. (The CREATE TABLE above is fine standalone;
-- just don't reorder STEP 2 below the policies.)

-- ============================================================
-- STEP 2 — security-definer role lookup function
-- ============================================================

create or replace function public.user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ============================================================
-- STEP 1b — profiles table policies (needs user_role() from STEP 2)
-- ============================================================

create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.user_role() = 'admin');

create policy profiles_insert_admin on public.profiles
  for insert to authenticated
  with check (public.user_role() = 'admin');

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.user_role() = 'admin')
  with check (public.user_role() = 'admin');

create policy profiles_delete_admin on public.profiles
  for delete to authenticated
  using (public.user_role() = 'admin');

-- ============================================================
-- STEP 3 — auto-create a profile row for every new auth user
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'viewer')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- STEP 4 — backfill profiles for users created before this migration
-- ============================================================

insert into public.profiles (id, email, role)
select id, email, 'viewer' from auth.users
on conflict (id) do nothing;

-- ============================================================
-- STEP 5 — bootstrap the first admin
-- ============================================================
-- Change this email first if m.nandipa@icloud.com shouldn't be the initial admin.

update public.profiles set role = 'admin' where email = 'm.nandipa@icloud.com';

-- ============================================================
-- STEP 6 — role-aware policies on every existing table
-- ============================================================

DO $$
DECLARE
  target_table text;
  pol record;
  target_tables text[] := ARRAY[
    'customers', 'customer_contacts', 'customer_comments', 'customer_approvals',
    'machines', 'machine_comments', 'machine_approvals',
    'raw_materials', 'raw_material_comments', 'raw_material_approvals',
    'projects', 'project_comments', 'project_approvals',
    'crm_accounts', 'quotes', 'contracts', 'work_orders', 'maintenance_events',
    'installation_sites', 'inventory_skus', 'purchase_orders', 'suppliers',
    'documents', 'drawings', 'sops', 'lessons_learned', 'employees',
    'compliance_findings', 'access_requests'
  ];
BEGIN
  FOREACH target_table IN ARRAY target_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = target_table
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);

      FOR pol IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = target_table
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, target_table);
      END LOOP;

      -- Any of the 3 roles can read.
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_role() IN (''admin'', ''editor'', ''viewer''))',
        target_table || '_select_by_role', target_table
      );
      -- Only admin/editor can create or modify records.
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_role() IN (''admin'', ''editor''))',
        target_table || '_insert_by_role', target_table
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_role() IN (''admin'', ''editor'')) WITH CHECK (public.user_role() IN (''admin'', ''editor''))',
        target_table || '_update_by_role', target_table
      );
      -- Only admin can delete.
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.user_role() = ''admin'')',
        target_table || '_delete_by_role', target_table
      );

      RAISE NOTICE 'Applied role-based RLS to public.%', target_table;
    ELSE
      RAISE NOTICE 'Skipped % (table does not exist)', target_table;
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- Verification queries — run these after the block above
-- ============================================================

-- 1. Confirm every user has a profile (should return 0 rows):
--    select u.id, u.email from auth.users u
--    left join public.profiles p on p.id = u.id
--    where p.id is null;

-- 2. See everyone's current role:
--    select email, role, created_at from public.profiles order by created_at;

-- 3. Promote someone to editor or admin later:
--    update public.profiles set role = 'editor' where email = 'someone@mmdi.in';

-- 4. Spot-check policies on one table:
--    select policyname, cmd, roles from pg_policies where tablename = 'customers';
