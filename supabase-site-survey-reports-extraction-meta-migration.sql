-- Site Survey Report Creator -- persists the AI extraction's `flagged`
-- field list and `pageHints` (see /api/site-survey-reports/[reportId]/extract)
-- so the Review step's flagged-fields banner and "pages that likely have a
-- photo" hints survive a page reload / a later session, instead of only
-- existing as transient client state for the run that produced them.
--
-- Nullable, no default: never set until extraction has actually run once.
-- Safe to re-run (add column if not exists).

alter table public.site_survey_reports
  add column if not exists extraction_meta jsonb;

-- Verification query -- run after the statement above
--   select column_name, data_type from information_schema.columns
--   where table_name = 'site_survey_reports' and column_name = 'extraction_meta';
