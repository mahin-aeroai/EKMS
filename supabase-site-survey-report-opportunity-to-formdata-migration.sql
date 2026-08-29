-- Moves Opportunity Information (name/type/location/store-facade-area/
-- apple-program-position/description/existing-material-type/existing-
-- creative-condition/existing-creative-removable/main-footfall-entrance-
-- note/additional-opportunity-notes) from being a PER-SITE field inside
-- site_survey_reports.measurements (jsonb array) to being filled ONCE per
-- report inside site_survey_reports.form_data -- see
-- apps/web/src/lib/siteSurveyReport/types.ts's SiteSurveyFormData header
-- comment for why. Both columns are jsonb, so no column/type change is
-- needed here -- this only backfills existing data so already-filled-in
-- reports don't lose what was typed into their first site's Opportunity
-- Information before this change, and it's safe to run more than once
-- (each field only copies over if form_data doesn't already have a value
-- for it).
--
-- Source of truth for "what was typed in": measurements->0, i.e. the first
-- site on the report -- Opportunity Information was always shown/edited
-- identically on every site card before this change (same UI, no per-site
-- distinction was actually made in practice), so the first site's values
-- are the report's best available answer.

update public.site_survey_reports
set form_data = form_data
  || jsonb_build_object(
       'opportunityName', coalesce(nullif(form_data->>'opportunityName', ''), measurements->0->>'opportunityName', ''),
       'opportunityType', coalesce(nullif(form_data->>'opportunityType', ''), measurements->0->>'opportunityType', ''),
       'opportunityTypeOther', coalesce(nullif(form_data->>'opportunityTypeOther', ''), measurements->0->>'opportunityTypeOther', ''),
       'opportunityLocation', coalesce(nullif(form_data->>'opportunityLocation', ''), measurements->0->>'opportunityLocation', ''),
       'storeFacadeArea', coalesce(nullif(form_data->>'storeFacadeArea', ''), measurements->0->>'storeFacadeArea', ''),
       'appleProgramPosition', coalesce(nullif(form_data->>'appleProgramPosition', ''), measurements->0->>'appleProgramPosition', ''),
       'opportunityDescription', coalesce(nullif(form_data->>'opportunityDescription', ''), measurements->0->>'opportunityDescription', ''),
       'existingMaterialType', coalesce(nullif(form_data->>'existingMaterialType', ''), measurements->0->>'existingMaterialType', ''),
       'existingCreativeConditionForOpportunity', coalesce(nullif(form_data->>'existingCreativeConditionForOpportunity', ''), measurements->0->>'existingCreativeConditionForOpportunity', ''),
       'existingCreativeRemovableForOpportunity', coalesce(nullif(form_data->>'existingCreativeRemovableForOpportunity', ''), measurements->0->>'existingCreativeRemovableForOpportunity', ''),
       'additionalOpportunityNotes', coalesce(nullif(form_data->>'additionalOpportunityNotes', ''), measurements->0->>'additionalOpportunityNotes', ''),
       'mainFootfallEntranceNote', coalesce(nullif(form_data->>'mainFootfallEntranceNote', ''), measurements->0->>'mainFootfallEntranceNote', '')
     )
where jsonb_typeof(measurements) = 'array' and jsonb_array_length(measurements) > 0;
