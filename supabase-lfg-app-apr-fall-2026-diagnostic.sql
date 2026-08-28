-- ============================================================
-- LFG Connect — diagnostic: "APP/APR sites moved to Fall 2026 are missing"
-- ============================================================
--
-- Read-only. Run in the Supabase SQL Editor, paste the results back.
--
-- Context: sites were moved into "Fall 2026" via Site Master's bulk
-- "Move to Program" (a plain `update lfg_sites set program_id = ...`,
-- RLS-gated to admin/editor), but the Programs page card for Fall 2026
-- now shows 0/a low site count for APP/APR.
--
-- Leading theory: Supabase RLS on UPDATE silently drops rows the caller
-- can't see/update instead of raising an error -- if this move was done
-- while the account was still 'viewer' (before the admin-role fix), the
-- UI would have shown "N sites moved" successfully even though ZERO rows
-- actually changed, because every targeted row failed the lfg_sites_update
-- policy's USING clause and was quietly excluded from the UPDATE. These
-- three queries confirm or rule that out.
--
-- ============================================================

-- ============================================================
-- QUERY 1 — every Program on file, exact name (watch for a near-duplicate
-- from a failed earlier attempt -- e.g. trailing space, different
-- capitalization -- lfg_programs.name has a UNIQUE constraint so an EXACT
-- duplicate is impossible, but "Fall 2026" vs "Fall 2026 " are different
-- strings to Postgres)
-- ============================================================

select id, name, length(name) as name_length, active, created_at
from public.lfg_programs
order by created_at desc;

-- ============================================================
-- QUERY 2 — APP/APR site count per Program (including "no Program"),
-- so you can see exactly where your APP/APR sites currently sit
-- ============================================================

select
  coalesce(p.name, '— No Program —') as program_name,
  s.format,
  count(*) as site_count
from public.lfg_sites s
left join public.lfg_programs p on p.id = s.program_id
where s.format in ('APP', 'APR')
group by coalesce(p.name, '— No Program —'), s.format
order by program_name, s.format;

-- ============================================================
-- QUERY 3 — sanity totals: how many APP/APR sites exist at all, and how
-- many currently have NO Program (never successfully moved anywhere)
-- ============================================================

select
  format,
  count(*) as total_sites,
  count(*) filter (where program_id is null) as unassigned_sites
from public.lfg_sites
where format in ('APP', 'APR')
group by format
order by format;
