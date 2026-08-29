-- Site Survey Report Creator -- adds the reference PDF's four photo-survey
-- viewpoints (A/B/C/D, per its own "Opportunity location(s) from various
-- points of view" diagram) as new site_survey_photos categories, alongside
-- the existing ones (main_site/orientation_*/measurement/other) rather than
-- replacing them -- see apps/web/src/lib/siteSurveyReport/types.ts's
-- PhotoCategory for what each viewpoint means.
--
-- Safe to re-run: drops the check constraint only if it exists under its
-- default Postgres-generated name, then re-adds it with the widened list.

alter table public.site_survey_photos
  drop constraint if exists site_survey_photos_category_check;

alter table public.site_survey_photos
  add constraint site_survey_photos_category_check check (category in (
    'main_site', 'orientation_right', 'orientation_left', 'orientation_opposite',
    'measurement', 'viewpoint_a', 'viewpoint_b', 'viewpoint_c', 'viewpoint_d', 'other'
  ));

-- Verification query -- run after the statements above
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.site_survey_photos'::regclass and conname = 'site_survey_photos_category_check';
