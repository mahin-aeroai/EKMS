-- MMDI ONE — Site Survey Reports: measurement -> measurements (array)
-- Run this in the Supabase SQL Editor, AFTER supabase-site-survey-reports-schema.sql
-- (Project: mahin-aeroai's Project, https://vzyrvzgtjcodxkjydxxn.supabase.co).
--
-- WHAT THIS CHANGES
-- site_survey_reports.measurement was a single jsonb object -- one
-- "Opportunity Information + Measurements + Apple standards" block per
-- report. A store can have more than one opportunity worth surveying in
-- this level of detail (e.g. two separate window/banner locations at the
-- same site), so this renames the column to `measurements` and changes its
-- shape to a jsonb ARRAY of that same object -- one array element per
-- site/opportunity, each still shaped exactly like the original
-- SiteSurveyMeasurement (apps/web/src/lib/siteSurveyReport/types.ts).
--
-- Existing rows keep their data: any row whose `measurement` value is a
-- single object (not already an array) is wrapped into a one-element
-- array, so every previously-created report still shows its one site as
-- "Site 1" after this runs. An empty/null value becomes an empty array.
--
-- Safe to re-run: the rename is a no-op if `measurements` already exists,
-- and the data-shape backfill only touches rows that aren't already an
-- array.

-- ============================================================
-- STEP 1 — rename the column (idempotent)
-- ============================================================
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'site_survey_reports' and column_name = 'measurement'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'site_survey_reports' and column_name = 'measurements'
  ) then
    alter table public.site_survey_reports rename column measurement to measurements;
  end if;
end $$;

-- ============================================================
-- STEP 2 — backfill: wrap any non-array value into a one-element array
-- ============================================================
update public.site_survey_reports
set measurements = case
  when measurements is null then '[]'::jsonb
  when jsonb_typeof(measurements) = 'array' then measurements
  when measurements = '{}'::jsonb then '[]'::jsonb
  else jsonb_build_array(measurements)
end
where measurements is null or jsonb_typeof(measurements) is distinct from 'array';

-- ============================================================
-- STEP 3 — column default going forward
-- ============================================================
alter table public.site_survey_reports alter column measurements set default '[]'::jsonb;
alter table public.site_survey_reports alter column measurements set not null;
