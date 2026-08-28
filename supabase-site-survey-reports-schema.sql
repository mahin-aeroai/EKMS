-- MMDI ONE — Site Survey Reports: persistence schema
-- Run this in the Supabase SQL Editor
-- (Project: mahin-aeroai's Project, https://vzyrvzgtjcodxkjydxxn.supabase.co).
--
-- WHAT THIS ADDS
-- Backing tables for the new "Site Survey Reports" tool (Site Survey Report
-- Creator) -- upload an existing Apple Site Inspection/Site Survey Report
-- PDF, have AI extract as much as it can, fill in the rest, organize
-- photos, confirm measurements, and export a matching PDF. Distinct from
-- the pre-existing, unrelated "Site Surveys" tool (apple_lfg_site_surveys,
-- supabase-lfg-site-surveys*.sql) -- that one is a read-only listing of
-- survey PDFs uploaded out-of-band by a script; this one is an in-app
-- CREATOR with its own tables.
--
-- Two tables:
--   site_survey_reports  one row per report -- header fields (site name,
--                        address, SFO ID, program, survey date, surveyor)
--                        as real columns since the dashboard searches/
--                        filters/sorts on those; everything else (the ~15
--                        one-off Q&A fields from the reference PDF's
--                        On-site details/Site suitability/Store
--                        description/Installation details/Additional
--                        details sections, plus the single measurement/
--                        material block) lives in form_data/measurement
--                        jsonb -- edited as one form, never individually
--                        queried, so a JSON blob backed by a shared TS
--                        type (apps/web/src/lib/siteSurveyReport/types.ts)
--                        is the right fit here, unlike Installation
--                        Report's narrower always-typed-columns shape.
--   site_survey_photos   one row per photo, keyed to its report and a
--                        category (main_site/orientation_right/
--                        orientation_left/orientation_opposite/
--                        measurement/other) matching the reference PDF's
--                        own photo sections.
--
-- field_sources
-- jsonb map of fieldName -> "ai" | "user" | "" on site_survey_reports --
-- purely UI-derived state driving the editor's ✓ auto-extracted /
-- ⚠ needs confirmation / ○ blank indicators. Not business data, doesn't
-- need its own table or typed columns.
--
-- RLS
-- Same uniform role-based policy as every other table in this app (see
-- supabase-role-based-rls-migration.sql's target list, and
-- supabase-installation-reports-schema.sql for the closest sibling
-- pattern): any of admin/editor/viewer can read, admin/editor can write,
-- admin can delete. A second, additive own-draft-delete policy for
-- non-admins is a separate migration
-- (supabase-site-survey-reports-own-draft-delete-migration.sql), mirroring
-- installation_reports' own version.
--
-- Safe to re-run (idempotent: create table if not exists, policies
-- dropped and recreated).

-- ============================================================
-- STEP 1 — tables
-- ============================================================

create table if not exists public.site_survey_reports (
  id                       uuid primary key default gen_random_uuid(),

  -- Header fields -- searched/filtered/sorted on the dashboard.
  store_name               text,
  address                  text,
  sfo_id                   text,
  program                  text,
  survey_date              date,
  surveyor_name            text,

  status                   text not null default 'draft'
                            check (status in ('draft', 'extracting', 'review_required', 'ready', 'generated')),
  -- 'pdf' = created via AI extraction from an uploaded survey PDF;
  -- 'manual' = started blank.
  source                   text not null check (source in ('pdf', 'manual')),
  source_pdf_relative_path text,   -- R2 key of the uploaded source PDF, when source = 'pdf'

  -- The long tail of one-off Q&A fields + the measurement/material block --
  -- see header comment for why these are jsonb, not typed columns. Shape
  -- documented and enforced on the TypeScript side only
  -- (apps/web/src/lib/siteSurveyReport/types.ts's FormData/Measurement).
  form_data                jsonb not null default '{}'::jsonb,
  measurement               jsonb not null default '{}'::jsonb,
  field_sources             jsonb not null default '{}'::jsonb,

  created_by                uuid references auth.users(id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  generated_at               timestamptz
);

create table if not exists public.site_survey_photos (
  id                    uuid primary key default gen_random_uuid(),
  report_id             uuid not null references public.site_survey_reports(id) on delete cascade,
  category              text not null check (category in (
                          'main_site', 'orientation_right', 'orientation_left',
                          'orientation_opposite', 'measurement', 'other'
                        )),
  relative_path         text not null,   -- R2 key
  caption               text,
  sort_order            int not null default 0,
  -- 'uploaded' = the user picked a file directly; 'extracted_from_pdf' =
  -- cropped from a rasterized page of the report's own source PDF.
  source                text not null check (source in ('uploaded', 'extracted_from_pdf')),
  original_page_number  int,             -- audit breadcrumb when source = extracted_from_pdf
  -- Fractional {x,y,w,h} rect (0-1 relative to the image), only ever set on
  -- the category='measurement' photo -- the red installation-area box drawn
  -- over it in the generated PDF's measurement page.
  annotation            jsonb,
  created_at            timestamptz not null default now()
);

create index if not exists site_survey_photos_report_id_idx
  on public.site_survey_photos(report_id);

-- ============================================================
-- STEP 2 — keep updated_at current on every UPDATE
-- ============================================================

create or replace function public.site_survey_reports_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists site_survey_reports_updated_at on public.site_survey_reports;

create trigger site_survey_reports_updated_at
  before update on public.site_survey_reports
  for each row execute function public.site_survey_reports_set_updated_at();

-- ============================================================
-- STEP 3 — role-based RLS, matching every sibling table
-- ============================================================

DO $$
DECLARE
  target_table text;
  pol record;
  target_tables text[] := ARRAY[
    'site_survey_reports', 'site_survey_photos'
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
-- Verification queries — run these after the block above
-- ============================================================

-- 1. Confirm both tables exist with RLS on:
--    select relname, relrowsecurity from pg_class
--    where relname in ('site_survey_reports', 'site_survey_photos');

-- 2. Spot-check policies on one table:
--    select policyname, cmd, roles from pg_policies where tablename = 'site_survey_reports';

-- 3. Confirm the FK resolves (should return 0 rows on an empty table, but
--    useful after the app starts writing):
--    select count(*) from public.site_survey_photos
--      where report_id not in (select id from public.site_survey_reports);
