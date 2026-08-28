-- Site Survey Report Creator -- master/pick-list tables for the
-- Measurements step's dropdowns (Material Type, Installation Type,
-- Equipment Source, Installed By). Mirrors the Installation Report
-- Creator's own master-table pattern exactly (see
-- supabase-installation-report-master-migration.sql): small
-- { id, name, active, created_at } tables, read via the same
-- MasterPickSelect component, with an inline "+ Add new" flow so a
-- surveyor who hits a value that isn't listed yet can add it in the form
-- rather than being blocked or forced into free text. Chosen over hardcoded
-- enum values in SiteSurveyMeasurement (which stays typed as `string` for
-- these fields) so the option lists stay admin-editable without a code
-- change, and over reusing installation_report_* tables directly, since a
-- site survey's installer/equipment source is not always the same roster
-- as an Installation Report's install team.
--
-- Safe to re-run (idempotent: create table if not exists, policies
-- dropped/recreated, seed inserts use on conflict do nothing).

-- ============================================================
-- STEP 1 -- tables
-- ============================================================

create table if not exists public.site_survey_report_materials (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.site_survey_report_installation_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.site_survey_report_equipment_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.site_survey_report_installers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- STEP 2 -- role-based RLS on all 4 tables (same shape as every other
-- table in this app -- see the target_tables loop in
-- supabase-installation-report-master-migration.sql)
-- ============================================================

DO $$
DECLARE
  target_table text;
  pol record;
  target_tables text[] := ARRAY[
    'site_survey_report_materials', 'site_survey_report_installation_types',
    'site_survey_report_equipment_sources', 'site_survey_report_installers'
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

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_role() IN (''admin'', ''editor'', ''viewer''))',
      target_table || '_select_by_role', target_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_role() IN (''admin'', ''editor''))',
      target_table || '_insert_by_role', target_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_role() IN (''admin'', ''editor'')) WITH CHECK (public.user_role() IN (''admin'', ''editor''))',
      target_table || '_update_by_role', target_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.user_role() = ''admin'')',
      target_table || '_delete_by_role', target_table
    );

    RAISE NOTICE 'Applied role-based RLS to public.%', target_table;
  END LOOP;
END $$;

-- ============================================================
-- STEP 3 -- a few starter rows so the pickers aren't empty on first use
-- (safe to skip/edit/delete from the Manage Master Data screen)
-- ============================================================

insert into public.site_survey_report_materials (name) values
  ('Vinyl'), ('Acrylic'), ('Foam Board'), ('Aluminium Composite'), ('Fabric'), ('Corflute')
on conflict (name) do nothing;

insert into public.site_survey_report_installation_types (name) values
  ('Wall Mounted'), ('Window Applied'), ('Freestanding'), ('Suspended / Ceiling'), ('Floor Graphic')
on conflict (name) do nothing;

insert into public.site_survey_report_equipment_sources (name) values
  ('Client Provided'), ('MMDI Supplied'), ('Third-Party Rental'), ('On-site Store Equipment')
on conflict (name) do nothing;

insert into public.site_survey_report_installers (name) values
  ('MMDI')
on conflict (name) do nothing;

-- ============================================================
-- Verification queries -- run these after the block above
-- ============================================================

-- 1. Confirm all 4 tables exist with RLS on:
--    select relname, relrowsecurity from pg_class
--    where relname like 'site_survey_report_%';

-- 2. Spot-check policies on one table:
--    select policyname, cmd, roles from pg_policies where tablename = 'site_survey_report_materials';

-- 3. See starter reference data:
--    select * from public.site_survey_report_materials order by name;
