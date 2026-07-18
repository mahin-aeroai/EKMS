-- MMDI ONE — Installation Report master data tables
-- Run this in the Supabase SQL Editor
-- (Project: mahin-aeroai's Project, https://vzyrvzgtjcodxkjydxxn.supabase.co).
--
-- WHAT THIS ADDS
-- The Installation Report tool (Operations > Installation Report) used to
-- have the operator retype Store Name / SFO ID / Program on every single
-- report, and free-type Fixture Type / Material / Installed-by-team as
-- plain text each time. This migration adds 6 small "master data" tables
-- so that information is entered once and picked from a list afterwards:
--
--   installation_report_stores          Store Master (name, address, SFO ID, program, campaign)
--   installation_report_creatives       Creative Master (program, campaign, creative name/version)
--   installation_report_fixture_types   reusable Fixture Type catalog
--   installation_report_materials       reusable Material catalog
--   installation_report_sign_types      reusable Sign Type catalog
--   installation_report_teams           reusable Installation Team roster
--
-- These are managed from the new in-app "Manage Master Data" screen
-- (Operations > Installation Report > Manage Master Data) — no need to use
-- the Supabase dashboard day-to-day after this migration runs once.
--
-- SECURITY MODEL — same role-based RLS as every other table in this app
-- (see supabase-role-based-rls-migration.sql for the full explanation of
-- the `public.user_role()` function and the 3 roles). This migration
-- assumes that earlier migration has already been run — it reuses
-- `public.user_role()` rather than redefining it. Run
-- supabase-role-based-rls-migration.sql FIRST if you haven't already.
--
-- Safe to re-run this file any number of times (idempotent: `create table
-- if not exists`, policies dropped and recreated).

-- ============================================================
-- STEP 1 — tables
-- ============================================================

create table if not exists public.installation_report_stores (
  id uuid primary key default gen_random_uuid(),
  store_name text not null,
  address text,
  sfo_id text,
  program text,
  campaign text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.installation_report_creatives (
  id uuid primary key default gen_random_uuid(),
  creative_name text not null,
  program text,
  campaign text,
  creative_version text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.installation_report_fixture_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.installation_report_materials (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.installation_report_sign_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.installation_report_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lead_name text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- STEP 2 — role-based RLS on all 6 tables
-- ============================================================

DO $$
DECLARE
  target_table text;
  pol record;
  target_tables text[] := ARRAY[
    'installation_report_stores', 'installation_report_creatives',
    'installation_report_fixture_types', 'installation_report_materials',
    'installation_report_sign_types', 'installation_report_teams'
  ];
BEGIN
  FOREACH target_table IN ARRAY target_tables LOOP
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
  END LOOP;
END $$;

-- ============================================================
-- STEP 3 — a few starter rows so the pickers aren't empty on first use
-- (safe to skip/edit — these are just common Apple retail install values;
-- delete or rename any of them from the Manage Master Data screen)
-- ============================================================

insert into public.installation_report_fixture_types (name) values
  ('Window Decal'), ('Table Talker'), ('Wall Graphic'), ('Ceiling Banner'), ('Entrance Signage')
on conflict (name) do nothing;

insert into public.installation_report_materials (name) values
  ('Vinyl'), ('Acrylic'), ('Foam Board'), ('Aluminium Composite'), ('Fabric')
on conflict (name) do nothing;

insert into public.installation_report_sign_types (name) values
  ('Window Graphic'), ('Freestanding Display'), ('Hanging Sign'), ('Wall Mounted'), ('Floor Graphic')
on conflict (name) do nothing;

-- ============================================================
-- Verification queries — run these after the block above
-- ============================================================

-- 1. Confirm all 6 tables exist with RLS on:
--    select relname, relrowsecurity from pg_class
--    where relname like 'installation_report_%';

-- 2. Spot-check policies on one table:
--    select policyname, cmd, roles from pg_policies where tablename = 'installation_report_stores';

-- 3. See starter reference data:
--    select * from public.installation_report_fixture_types order by name;
