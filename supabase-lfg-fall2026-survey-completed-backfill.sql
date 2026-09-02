-- One-time backfill (Srinivas): "let's refresh the Fall 2026 program as
-- default site survey" -- every site in the Fall 2026 program that's
-- still earlier than Site Survey Completed gets moved to Site Survey
-- Completed, no saved report required. This SUPERSEDES the earlier
-- version of this file (which additionally required
-- lfg_site_documents.category = 'survey' to be on file) -- confirmed with
-- Srinivas: treat the whole Fall 2026 batch as surveyed by default,
-- regardless of whether a report PDF has actually been saved for a given
-- site yet.
--
-- Run STEP 1 first and read the result before running STEP 2 -- confirms
-- how many/which sites will actually change before anything is written.
-- STEP 2 only ever moves a site FORWARD to 'survey_completed' from
-- 'new'/'survey_pending' -- never touches a site already at
-- survey_completed or any later stage (production/shipped/delivered/
-- etc.), so this can't regress or overwrite a status that's already
-- correct or further along. lfg_site_status_history logs this
-- automatically via its own existing trigger (supabase-lfg-site-
-- management-schema.sql's STEP 8) -- no separate history insert needed
-- here.

-- STEP 1 — preview: which sites would this touch?
select s.id, s.site_id, s.outlet_name, s.sfo_id, s.site_status
from public.lfg_sites s
where s.site_status in ('new', 'survey_pending')
  and s.program_id = (select id from public.lfg_programs where name = 'Fall 2026' limit 1)
order by s.sfo_id nulls last;

-- STEP 2 — the actual backfill. Only run this after STEP 1's result looks
-- right.
update public.lfg_sites s
set site_status = 'survey_completed'
where s.site_status in ('new', 'survey_pending')
  and s.program_id = (select id from public.lfg_programs where name = 'Fall 2026' limit 1);
