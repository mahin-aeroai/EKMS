-- ============================================================
-- One-time backfill: lfg_production.status / lfg_installations.
-- installation_status = 'completed' for every non-archived site whose
-- own site_status has already advanced past that checkpoint.
--
-- 22 Sept 2026 task feedback (Mahin): "filter: installed not working also
-- not installed showing even installed ones."
--
-- Root cause: the Printed/Installed filters (OPERATIONS.md #31 item 1)
-- and the Site Card's own checklist (#32) both read the REAL signal --
-- lfg_production.status = 'completed' / lfg_installations.
-- installation_status = 'completed' -- instead of site_status's own rank.
-- That's correct for any site whose production/installation was marked
-- done THROUGH the app going forward (#31 item 2 made the Production/
-- Installation tabs and the partner "Mark Printed"/"Mark Installed"
-- quick-actions write both signals together). But it does nothing for a
-- site whose status reached "In Production"/"Dispatched"/"Delivered"/
-- "Installation Completed"/etc. the OLD way -- the generic Change Status
-- dropdown, a direct database edit, or an import -- before that sync
-- existed. For every one of those (almost certainly most of the existing
-- 325 sites), no lfg_production/lfg_installations row was ever created or
-- completed, so the real-signal filter correctly (per the data on file)
-- read them as "not printed"/"not installed" even though the site's own
-- status plainly says otherwise -- exactly the "not installed showing
-- even installed ones" Mahin is seeing.
--
-- This runs once, backfilling both signals from site_status's own rank
-- (LFG_STATUSES' fixed order in lfgStatus.ts) for every currently
-- non-archived site. Same simplification the six-checkpoint benchmark
-- checklist already documents and relies on (lfgStatus.ts's own comment
-- on LFG_BENCHMARKS/lfgBenchmarkStatus): a site sitting in an end-state
-- like Active/On Hold/Deactivated is treated as having crossed every
-- earlier checkpoint, since LFG_STATUSES places those states after
-- Installation Completed in its own order.
--
-- Idempotent and safe to run more than once: it only ever moves a row TO
-- 'completed' (never away from it, and never for a site whose status
-- genuinely hasn't reached that checkpoint yet), so it can't un-do a
-- correct "not printed"/"not installed" read for a site that's really
-- still mid-pipeline, and running it again after new sites/statuses have
-- since arrived just backfills whatever newly qualifies.
-- ============================================================

with status_rank(site_status, rank) as (
  values
    ('new', 0), ('survey_pending', 1), ('survey_completed', 2), ('survey_approved', 3),
    ('production_pending', 4), ('in_production', 5), ('ready_for_dispatch', 6),
    ('dispatched', 7), ('in_transit', 8), ('delivered', 9),
    ('installation_planned', 10), ('installation_in_progress', 11), ('installation_completed', 12),
    ('active', 13), ('deactivation_requested', 14), ('deactivated', 15),
    ('on_hold', 16), ('issue_attention_required', 17)
)
insert into public.lfg_production as lp (site_id, status, completed_at, updated_at)
select s.id, 'completed', now(), now()
from public.lfg_sites s
join status_rank r on r.site_status = s.site_status
where r.rank >= 5  -- in_production -- "Printed" checkpoint
  and s.archived_at is null
on conflict (site_id) do update
  set status = 'completed',
      completed_at = coalesce(lp.completed_at, excluded.completed_at),
      updated_at = now()
  where lp.status <> 'completed';

with status_rank(site_status, rank) as (
  values
    ('new', 0), ('survey_pending', 1), ('survey_completed', 2), ('survey_approved', 3),
    ('production_pending', 4), ('in_production', 5), ('ready_for_dispatch', 6),
    ('dispatched', 7), ('in_transit', 8), ('delivered', 9),
    ('installation_planned', 10), ('installation_in_progress', 11), ('installation_completed', 12),
    ('active', 13), ('deactivation_requested', 14), ('deactivated', 15),
    ('on_hold', 16), ('issue_attention_required', 17)
)
insert into public.lfg_installations as li (site_id, installation_status, updated_at)
select s.id, 'completed', now()
from public.lfg_sites s
join status_rank r on r.site_status = s.site_status
where r.rank >= 12  -- installation_completed -- "Installed" checkpoint
  and s.archived_at is null
on conflict (site_id) do update
  set installation_status = 'completed',
      updated_at = now()
  where li.installation_status <> 'completed';
