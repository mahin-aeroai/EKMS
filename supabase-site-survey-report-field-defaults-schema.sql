-- MMDI ONE — Site Survey Reports: saved field defaults
-- Run this in the Supabase SQL Editor
-- (Project: mahin-aeroai's Project, https://vzyrvzgtjcodxkjydxxn.supabase.co).
--
-- WHAT THIS ADDS
-- A single-row ("singleton") table holding one saved set of default answers
-- for the Complete Details form (site_survey_reports.form_data's own
-- shape -- apps/web/src/lib/siteSurveyReport/types.ts's SiteSurveyFormData).
-- Most of that ~66-field form repeats the same answer report after report
-- (permit process, standard safety equipment, delivery windows, and so on)
-- -- this lets a person fill those in ONCE, on a dedicated "Default
-- Answers" settings page, rather than re-typing them on every new report.
--
-- HOW IT'S USED (app-side, not this migration)
--   - A brand-new MANUALLY-started report pre-fills its form_data from this
--     row at creation time (SiteSurveyReportsListClient.tsx's
--     startNewReport).
--   - The Complete Details / Review steps also offer an explicit
--     "Apply saved defaults" action that merges this row's values into
--     whatever's still BLANK on the current report -- never overwrites a
--     field the person (or AI extraction) already filled in, same
--     never-clobber merge rule the AI extraction route already follows.
-- Deliberately NOT auto-applied to PDF-sourced reports at creation time --
-- AI extraction should get the first, unobstructed look at every field on
-- an uploaded PDF; a defaulted value sitting in a field before extraction
-- runs would make extraction skip it even when the real PDF disagrees.
--
-- WHY A SINGLETON TABLE (not a column on some existing settings row)
-- There's no existing app-wide settings table this fits into, and one saved
-- template is all this feature needs today (not one per user) -- `id`
-- is a `boolean primary key default true check (id)`, a standard Postgres
-- trick that makes a second row structurally impossible (the only legal
-- value for a boolean primary key already in use is `true`, which collides
-- on insert). If per-user templates are ever needed, that's a follow-up
-- migration, not a reason to over-build this one now.
--
-- RLS
-- Same uniform role-based policy as every sibling table (see
-- supabase-site-survey-reports-schema.sql): any of admin/editor/viewer can
-- read, admin/editor can write (insert/update -- the app always upserts
-- this single row), admin can delete.
--
-- Safe to re-run (idempotent: create table if not exists, policies dropped
-- and recreated).

-- ============================================================
-- STEP 1 — table
-- ============================================================

create table if not exists public.site_survey_report_field_defaults (
  id          boolean primary key default true check (id),
  form_data   jsonb not null default '{}'::jsonb,
  updated_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- STEP 2 — keep updated_at current on every UPDATE
-- ============================================================

create or replace function public.site_survey_report_field_defaults_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists site_survey_report_field_defaults_updated_at on public.site_survey_report_field_defaults;

create trigger site_survey_report_field_defaults_updated_at
  before update on public.site_survey_report_field_defaults
  for each row execute function public.site_survey_report_field_defaults_set_updated_at();

-- ============================================================
-- STEP 3 — role-based RLS, matching every sibling table
-- ============================================================

DO $$
DECLARE
  target_table text;
  pol record;
  target_tables text[] := ARRAY[
    'site_survey_report_field_defaults'
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
    -- Only admin/editor can create or modify the row (the app always
    -- upserts, so both INSERT and UPDATE need this).
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
-- Verification queries — run these after the block above
-- ============================================================

-- 1. Confirm the table exists with RLS on:
--    select relname, relrowsecurity from pg_class
--    where relname = 'site_survey_report_field_defaults';

-- 2. Spot-check policies:
--    select policyname, cmd, roles from pg_policies
--    where tablename = 'site_survey_report_field_defaults';

-- 3. A second row is structurally impossible (uncomment to see it fail):
--    insert into public.site_survey_report_field_defaults (id) values (false);
