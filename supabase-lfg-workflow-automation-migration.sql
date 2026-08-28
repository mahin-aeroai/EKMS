-- ============================================================
-- LFG Connect: workflow automation + status-change permissions
-- ============================================================
--
-- Implements three rules from the task:
--
-- 1. "when sites are mapped to a new program if site survey report
--    attached to it then site survey completed and default status will
--    be awaiting for creatives" -- a new BEFORE UPDATE trigger
--    (lfg_sites_program_mapping_defaults) auto-advances a site's
--    site_status to 'survey_completed' the moment it's mapped into a
--    Program (program_id set/changed to a real value), but ONLY if a
--    Site Survey document is already on file (lfg_site_documents,
--    category='survey') AND the site is still sitting at the very start
--    of its lifecycle ('new' or 'survey_pending') -- never regresses a
--    site that's already further along. Leaves creative_received_at
--    untouched (still null), which is exactly what the rest of the app
--    already reads as "awaiting creative" (LFG_BENCHMARKS' Creative
--    Received checkpoint, the Program Dashboard's Creative Receipt
--    pipeline stage) -- no new status value needed for "awaiting
--    creative" itself.
--
-- 2. "Creative received has to be updated by the users MMDI" / "In
--    production after creative approval so MMDI will update that status
--    too" / "Shipped will be updated by MMDI once printed and shipped"
--    (Delivered and Installed stay open to both MMDI and the
--    installation partner, unchanged) -- extends the EXISTING
--    lfg_sites_guard_partner_update() trigger (the same one that already
--    blocks a partner from changing outlet name/format/SFO ID) to also
--    reject a partner: changing creative_received_at/creative_received_by
--    at all, or setting site_status to production_pending/in_production/
--    ready_for_dispatch/dispatched/in_transit. This is the real
--    enforcement -- apps/web/src/lib/lfgStatus.ts's
--    LFG_PARTNER_RESTRICTED_STATUSES and LfgPartnerSiteClient.tsx's
--    filtered status picker / hidden Creative Received control are just
--    the UI mirror of this, so a partner doesn't even see an option the
--    database would reject anyway. Keep both lists in sync if either
--    changes.
--
-- 3. Issue / Attention Required sites -- deliberately NO change needed.
--    LFG_PIPELINE_STAGES (lfgStatus.ts) already buckets
--    issue_attention_required (and on_hold) under its own "issues" stage,
--    separate from "active" -- every Active count/tile in the app
--    (Program summary tiles, the Site Master's Active column, the
--    Programs page's per-stage counts) already excludes a flagged site
--    from being counted as Active, while site_status itself stays
--    visibly 'issue_attention_required' until a person manually changes
--    it back to 'active'. Confirmed by reading that code rather than
--    guessing -- nothing to run here.
--
-- Idempotent and safe to re-run: CREATE OR REPLACE FUNCTION for the
-- guard (the trigger itself is already attached and picks up the new
-- body automatically), DROP TRIGGER IF EXISTS + CREATE TRIGGER for the
-- new one. No data is touched by running this file itself -- it only
-- changes behavior for updates FROM NOW ON.

create or replace function public.lfg_sites_guard_partner_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_lfg_partner_user() and not public.is_mmdi_staff() then
    if new.partner_id is distinct from old.partner_id
       or new.outlet_name is distinct from old.outlet_name
       or new.format is distinct from old.format
       or new.sfo_id is distinct from old.sfo_id
    then
      raise exception 'Partners cannot change site ownership, outlet name, format, or SFO ID — contact MMDI.';
    end if;

    -- Creative Received is an MMDI-only milestone.
    if new.creative_received_at is distinct from old.creative_received_at
       or new.creative_received_by is distinct from old.creative_received_by
    then
      raise exception 'Only MMDI can mark Creative Received — contact MMDI.';
    end if;

    -- Production and shipping statuses are MMDI-only. Delivered and
    -- every installation status stay open to both parties (not listed
    -- here -- no restriction on them).
    if new.site_status is distinct from old.site_status
       and new.site_status in ('production_pending', 'in_production', 'ready_for_dispatch', 'dispatched', 'in_transit')
    then
      raise exception 'Only MMDI can set this status (%) — contact MMDI.', new.site_status;
    end if;
  end if;
  return new;
end;
$$;

-- Auto-advances site_status to 'survey_completed' when a site is newly
-- mapped into a Program and already has a Site Survey document on file --
-- see the header comment (rule 1) for the full reasoning. BEFORE UPDATE
-- so it can set NEW.site_status directly; runs alongside (not instead of)
-- the guard trigger above and the existing lfg_site_status_history
-- logging trigger (an AFTER trigger, so it sees this trigger's final
-- site_status value, same as any other change made within this UPDATE).
create or replace function public.lfg_sites_program_mapping_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.program_id is distinct from old.program_id and new.program_id is not null then
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
