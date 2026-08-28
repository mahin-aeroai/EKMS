-- ============================================================
-- LFG Connect — Reset site status on Program reassignment
-- ============================================================
--
-- Bug report: a site (e.g. "Aptronix @ Malabar", APR format) showing on
-- Site Cards under a brand-new Program ("Fall 2026", not yet started)
-- with every benchmark checkmark crossed off, including "Installed" --
-- even though nothing has happened yet for that Program.
--
-- Root cause: site_status lives on lfg_sites as a single column, not one
-- value per (site, Program). Most formats (Croma, Reliance, Vijay Sales,
-- APR, etc.) aren't permanent placements -- a site is freshly re-selected
-- into each new Program via "Move to Program" (page.tsx's
-- handleMoveToProgram, a plain `update lfg_sites set program_id = ...`).
-- The existing lfg_sites_program_mapping_defaults trigger only ever
-- ADVANCED site_status on a program change (to survey_completed, if a
-- survey doc was already on file) -- it never reset a site that was
-- already further along from a previous Program's cycle. So a site
-- that was fully Installed for, say, "Summer 2026" and then got
-- re-selected into "Fall 2026" kept showing as Installed on Fall 2026's
-- Status Sheet and Site Cards, when really Fall 2026 hadn't touched it
-- yet.
--
-- Fix, two parts:
--  1. STEP 1 replaces the trigger function so any FUTURE program
--     reassignment (program_id changes to a different Program, and the
--     site was already in some other Program before) resets site_status
--     back to 'new' (or 'survey_completed' if a survey doc is already on
--     file for this site -- same forward-advance rule as before) and
--     clears creative_received_at/by. A site's first-ever Program
--     assignment (old.program_id is null) is untouched -- nothing stale
--     to clear. This is the same fix now folded into
--     supabase-lfg-site-management-schema.sql for fresh deploys.
--  2. STEP 2/3 is a one-time repair for sites that were ALREADY moved
--     into their current Program before this trigger fix existed, so
--     they're stuck showing stale progress right now. Fill in the exact
--     Program name below (as it appears in your Programs list, e.g.
--     'Fall 2026') and run STEP 2 first to see exactly which sites would
--     be reset and what they'd change from, before running STEP 3.
--
-- Not touched by this migration (separate, out of scope):
--  - lfg_installations and lfg_installation_costs are one row per SITE
--    (site_id is their primary key), not per Program cycle -- a site
--    reused across Programs keeps its old installation_date/team/report
--    from a prior cycle until someone starts a fresh Installation record
--    for it. Worth a follow-up if this also needs to reset per Program.
--  - lfg_shipments (AWB) is an append-only log, left alone deliberately
--    -- it's history, not a "current status" field to reset.
--  - site_verified_at/by (Site Verified milestone) -- same "one row per
--    site" shape as above, not touched here.
--
-- ============================================================

-- ============================================================
-- STEP 1 — fix the trigger going forward (safe to re-run)
-- ============================================================

create or replace function public.lfg_sites_program_mapping_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.program_id is distinct from old.program_id and new.program_id is not null then
    if old.program_id is not null then
      new.site_status := 'new';
      new.creative_received_at := null;
      new.creative_received_by := null;
    end if;

    if new.site_status in ('new', 'survey_pending') then
      if exists (
        select 1 from public.lfg_site_documents d
        where d.site_id = new.id and d.category = 'survey'
      ) then
        new.site_status := 'survey_completed';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists lfg_sites_program_mapping_defaults_trigger on public.lfg_sites;
create trigger lfg_sites_program_mapping_defaults_trigger
  before update on public.lfg_sites
  for each row execute function public.lfg_sites_program_mapping_defaults();

-- ============================================================
-- STEP 2 — PREVIEW the one-time repair
-- ============================================================
-- Fill in the exact Program name below (must match lfg_programs.name).
-- Run this first and check the list before running STEP 3.

with target_program as (
  select id, name from public.lfg_programs
  where name = 'Fall 2026'   -- <-- change this to your Program's exact name
)
select
  s.site_id,
  s.outlet_name,
  s.format,
  tp.name as program_name,
  s.site_status as current_site_status,
  s.creative_received_at as current_creative_received_at,
  exists (
    select 1 from public.lfg_site_documents d
    where d.site_id = s.id and d.category = 'survey'
  ) as has_survey_doc,
  case
    when exists (
      select 1 from public.lfg_site_documents d
      where d.site_id = s.id and d.category = 'survey'
    ) then 'survey_completed'
    else 'new'
  end as status_after_reset
from public.lfg_sites s
join target_program tp on tp.id = s.program_id
where s.site_status not in ('new', 'survey_pending', 'survey_completed')
   or s.creative_received_at is not null
order by s.outlet_name;

-- ============================================================
-- STEP 3 — UPDATE (only run after checking STEP 2's output)
-- ============================================================
-- Same Program name as STEP 2 -- keep them in sync.

with target_program as (
  select id from public.lfg_programs
  where name = 'Fall 2026'   -- <-- change this to your Program's exact name
)
update public.lfg_sites s
set
  site_status = case
    when exists (
      select 1 from public.lfg_site_documents d
      where d.site_id = s.id and d.category = 'survey'
    ) then 'survey_completed'
    else 'new'
  end,
  creative_received_at = null,
  creative_received_by = null
from target_program tp
where s.program_id = tp.id
  and (
    s.site_status not in ('new', 'survey_pending', 'survey_completed')
    or s.creative_received_at is not null
  );
