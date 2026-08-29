-- Backfills the one form_data field being restructured in this pass that
-- has a reasonable prior-data mapping:
--  * appleRepresentative (a single free-text field) -> appleRepresentativeName
--    (the closest of the three new split fields -- Mobile/Email have no
--    prior data to backfill from, since they didn't exist before this
--    pass; see SiteSurveyFormData's own header comment in
--    apps/web/src/lib/siteSurveyReport/types.ts).
--
-- The old "Printer" field has no equivalent backfill target -- it's
-- replaced by surveyCompany, a closed MMDI/I&S choice that arbitrary free
-- text can't be reliably mapped into, so it's simply left unread going
-- forward. Every other field removed in this same pass (Site Suitability,
-- Graphics except extra lighting, Opportunity Information, several
-- address/notes/"if Other" fields) has no replacement to backfill into
-- either. In every case the OLD jsonb key is left untouched in
-- already-saved rows (non-destructive -- see this feature's other
-- migrations' own convention) rather than stripped; the application code
-- simply stops reading it.
--
-- Safe to run more than once: only fills appleRepresentativeName when it's
-- not already set.

update public.site_survey_reports
set form_data = form_data
  || jsonb_build_object(
       'appleRepresentativeName', coalesce(nullif(form_data->>'appleRepresentativeName', ''), form_data->>'appleRepresentative', '')
     )
where coalesce(form_data->>'appleRepresentative', '') <> ''
  and coalesce(form_data->>'appleRepresentativeName', '') = '';

update public.site_survey_report_field_defaults
set form_data = form_data
  || jsonb_build_object(
       'appleRepresentativeName', coalesce(nullif(form_data->>'appleRepresentativeName', ''), form_data->>'appleRepresentative', '')
     )
where coalesce(form_data->>'appleRepresentative', '') <> ''
  and coalesce(form_data->>'appleRepresentativeName', '') = '';
