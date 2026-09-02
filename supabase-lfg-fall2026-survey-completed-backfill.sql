-- One-time backfill (Srinivas, screenshots of "Aptronix @ Malabar" etc. --
-- his own site_survey_reports button already read "Report Not Saved"
-- while other Fall 2026 sites had a saved report on file but were still
-- sitting at site_status 'new'/'survey_pending', earlier than the
-- benchmark checklist's own "Site Survey Completed" checkpoint): "if site
-- survey report available then mark as site survey completed then it
-- follow the sequence."
--
-- Confirmed with Srinivas: this is a ONE-TIME data catch-up for the
-- existing Fall 2026 program's sites, not a new standing rule -- run once
-- in the Supabase SQL Editor, nothing to deploy.
--
-- "Site survey report available" = the exact same signal the site cards'
-- own "Site Survey" / "Report Not Saved" button already reads:
-- lfg_site_documents.category = 'survey' (see LfgSiteCardGrid.tsx's
-- surveyDocBySite fetch) -- not the separate site_survey_reports table
-- (the standalone Report Creator tool's own drafts), so this lines up
-- with exactly what the card visibly shows for each site.
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
  and exists (
    select 1 from public.lfg_site_documents d
    where d.site_id = s.id and d.category = 'survey'
  )
order by s.sfo_id nulls last;

-- STEP 2 — the actual backfill. Only run this after STEP 1's result looks
-- right.
update public.lfg_sites s
set site_status = 'survey_completed'
where s.site_status in ('new', 'survey_pending')
  and s.program_id = (select id from public.lfg_programs where name = 'Fall 2026' limit 1)
  and exists (
    select 1 from public.lfg_site_documents d
    where d.site_id = s.id and d.category = 'survey'
  );
