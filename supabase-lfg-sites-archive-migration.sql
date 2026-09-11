-- =====================================================================
-- LFG Connect: soft-archive lfg_sites
-- =====================================================================
-- 11 Sept 2026: task feedback -- "whatever we marked the sites for Fall
-- 2026 keep them as permanent sites and move rest all sites to archive.
-- Create archive pool and push them they should never display on cards
-- even on total sites cards. only archval area they should show the no
-- of sites." Clarified: EVERY lfg_sites row whose Program (Season) isn't
-- "Fall 2026" gets archived -- including sites with no Program assigned
-- at all, and including sites unrelated to the recent bulk import.
--
-- This is a SOFT archive, not a delete: adds `archived_at`/`archived_by`
-- columns. A non-null archived_at means "excluded from every normal
-- Site Master/Dashboard/Program/Store/Estimate view and every stat
-- count" -- see the app-side code changes delivered alongside this
-- migration for the full list of queries that now filter on it. The
-- row itself, and its own detail page/documents/history, are untouched
-- and still directly reachable -- only list/aggregate views hide it.
-- Reversible any time via the new Archive page's "Restore" button (sets
-- archived_at back to null), or by hand: `update lfg_sites set
-- archived_at = null, archived_by = null where id = '...'`.
-- =====================================================================

-- STEP 1 -- safe to run immediately, additive only.

alter table public.lfg_sites add column if not exists archived_at timestamptz;
alter table public.lfg_sites add column if not exists archived_by uuid references auth.users(id);
create index if not exists lfg_sites_archived_at_idx on public.lfg_sites(archived_at);

-- =====================================================================
-- STEP 2 -- IMPORTANT: run this diagnostic BEFORE the archive step below.
-- It tells you whether "Fall 2026" actually exists as a real Program
-- (Season) row, and how many sites are currently linked to it. If
-- `fall_2026_program_id` comes back null, or `sites_tagged_fall_2026`
-- is 0 (or far lower than the ~177 sites from the recent bulk import),
-- that means the sites you want kept were never actually tagged with a
-- "Fall 2026" Program row -- come back and tell me before running STEP
-- 3, since as written it would archive those too.
-- =====================================================================

select
  (select id from public.lfg_programs where lower(trim(name)) = 'fall 2026') as fall_2026_program_id,
  (select count(*) from public.lfg_sites
     where program_id = (select id from public.lfg_programs where lower(trim(name)) = 'fall 2026')) as sites_tagged_fall_2026,
  (select count(*) from public.lfg_sites where program_id is null) as sites_with_no_program,
  (select count(*) from public.lfg_sites) as total_sites;

-- Same breakdown, by every distinct Program name currently in use, so
-- you can see at a glance what "the rest" actually consists of before
-- archiving it.

select
  coalesce(p.name, '(no program assigned)') as program_name,
  count(*) as site_count
from public.lfg_sites s
left join public.lfg_programs p on p.id = s.program_id
group by 1
order by 2 desc;

-- =====================================================================
-- STEP 3 -- only after STEP 2 looks right (fall_2026_program_id is not
-- null, and sites_tagged_fall_2026 is the count you expect to keep).
-- Archives every site whose Program isn't Fall 2026, including sites
-- with no Program assigned at all. Commented out on purpose.
-- =====================================================================

-- update public.lfg_sites
-- set archived_at = now(), archived_by = null
-- where archived_at is null
--   and (
--     program_id is null
--     or program_id <> (select id from public.lfg_programs where lower(trim(name)) = 'fall 2026')
--   );

-- To check the result afterwards:
-- select count(*) filter (where archived_at is not null) as archived,
--        count(*) filter (where archived_at is null) as active
-- from public.lfg_sites;
