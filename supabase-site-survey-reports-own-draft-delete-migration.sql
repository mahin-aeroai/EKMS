-- MMDI ONE — Site Survey Reports: let a user discard their own stuck drafts
-- Run this in the Supabase SQL Editor
-- (Project: mahin-aeroai's Project, https://vzyrvzgtjcodxkjydxxn.supabase.co).
--
-- WHY
-- site_survey_reports' existing delete policy (site_survey_reports_delete_by_role,
-- see supabase-site-survey-reports-schema.sql) is admin-only, matching every
-- other table's uniform role-based RLS. That's the right default, but it
-- means an editor/viewer who started a draft (a manual entry abandoned
-- partway through, or a PDF extraction that went wrong) has no self-serve
-- way to clear it from their own dashboard -- same case
-- supabase-installation-reports-own-draft-delete-migration.sql already
-- solved for Installation Report.
--
-- This adds a second, narrower policy alongside the existing one (RLS
-- policies for the same command are OR'd together, so this is additive, not
-- a replacement): the report's own creator can delete it, but only while
-- it's still status = 'draft'. A report that's moved past draft (extracting,
-- review_required, ready, generated) can never be deleted this way -- only
-- the admin-only policy reaches it from there.
--
-- Safe to re-run: `create policy` has no "if not exists", so this drops its
-- own policy first if present, then recreates it -- it does not touch
-- site_survey_reports_delete_by_role.

drop policy if exists "own draft site survey reports deletable" on public.site_survey_reports;

create policy "own draft site survey reports deletable"
on public.site_survey_reports for delete
using (created_by = auth.uid() and status = 'draft');

-- Verification queries — run after the statement above
-- 1. Confirm both delete policies are present:
--    select policyname, cmd, roles from pg_policies where tablename = 'site_survey_reports' and cmd = 'DELETE';
-- 2. Confirm a report past draft status still cannot be deleted by its own
--    creator (expect 0 rows affected when run as that creator, not an error):
--    delete from site_survey_reports where id = '<a non-draft report''s id>';
