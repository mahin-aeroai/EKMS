-- ============================================================
-- LFG: "full-lifecycle partner" flag — lets MMDI's own partner login
-- (lfgconnect.mmdi.in, logged in as "MMDI") do creative-received,
-- production, and dispatch updates from the SAME portal it already uses
-- for site survey + shipping/tracking + installation, instead of
-- switching to the internal staff tool for those stages.
--
-- Context: Srinivas's own company, MMDI, is registered as an lfg_partners
-- row (the installation partner on its own sites) but is ALSO the same
-- organization that runs creative, production, and dispatch for every
-- site — as MMDI staff, via the internal app. Previously,
-- lfg_sites_guard_partner_update() (supabase-lfg-workflow-automation-
-- migration.sql) blocked ANY partner account — MMDI's own partner login
-- included — from touching creative_received_at/_by, or setting
-- site_status to production_pending/in_production/ready_for_dispatch/
-- dispatched/in_transit. That trigger has no way to tell "MMDI's own
-- partner login" apart from a genuinely external installation partner
-- who might also sign into this same portal, so a blanket unblock for
-- is_lfg_partner_user() would have opened creative/production/dispatch
-- writes to every partner, not just MMDI.
--
-- Fix: a new is_full_lifecycle_partner flag on lfg_partners (default
-- false — every existing/future partner stays exactly as restricted as
-- before unless explicitly flagged), and a new
-- lfg_partner_is_full_lifecycle() helper, same style as the existing
-- is_lfg_partner_user()/lfg_partner_id(). The guard trigger and
-- lfg_production's write policy each carve out an exception for a
-- flagged partner acting on their OWN sites; nothing else changes.
--
-- Deliberately NOT touched by this migration (out of scope for what was
-- asked): Site Survey approval (lfg_site_surveys' Approve button) stays
-- admin/editor-only — that table's write policy has no partner clause at
-- all, a separate QC step unrelated to creative/production/dispatch.
--
-- Idempotent and safe to re-run.
-- ============================================================

alter table public.lfg_partners
  add column if not exists is_full_lifecycle_partner boolean not null default false;

create or replace function public.lfg_partner_is_full_lifecycle()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_full_lifecycle_partner
       from public.lfg_partner_users u
       join public.lfg_partners p on p.id = u.partner_id
      where u.id = auth.uid()),
    false
  )
$$;

-- Supersedes the guard body in supabase-lfg-workflow-automation-
-- migration.sql — the ownership/outlet-name/format/SFO-ID restriction
-- stays unconditional for every partner (unchanged); only the Creative
-- Received and production/shipping-status checks are now skipped for a
-- full-lifecycle partner.
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

    if not public.lfg_partner_is_full_lifecycle() then
      if new.creative_received_at is distinct from old.creative_received_at
         or new.creative_received_by is distinct from old.creative_received_by
      then
        raise exception 'Only MMDI can mark Creative Received — contact MMDI.';
      end if;

      if new.site_status is distinct from old.site_status
         and new.site_status in ('production_pending', 'in_production', 'ready_for_dispatch', 'dispatched', 'in_transit')
      then
        raise exception 'Only MMDI can set this status (%) — contact MMDI.', new.site_status;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Trigger attachment itself is unchanged (already fires this function);
-- re-declared here only for parity with how the earlier guard-trigger
-- migrations in this project each re-state it.
drop trigger if exists lfg_sites_guard_partner_update_trigger on public.lfg_sites;
create trigger lfg_sites_guard_partner_update_trigger
  before update on public.lfg_sites
  for each row execute function public.lfg_sites_guard_partner_update();

-- lfg_production: staff full access, unchanged; a full-lifecycle
-- partner now also gets write access on their OWN sites' row (upsert —
-- same pattern ProductionTab's "Start Production"/"Mark Completed"
-- buttons already use). An ordinary, non-flagged partner keeps
-- read-only, exactly as before.
drop policy if exists lfg_production_write_staff on public.lfg_production;
create policy lfg_production_write_staff on public.lfg_production
  for all to authenticated
  using (
    public.user_role() in ('admin', 'editor')
    or (
      public.lfg_partner_is_full_lifecycle()
      and exists (select 1 from public.lfg_sites s where s.id = public.lfg_production.site_id and s.partner_id = public.lfg_partner_id())
    )
  )
  with check (
    public.user_role() in ('admin', 'editor')
    or (
      public.lfg_partner_is_full_lifecycle()
      and exists (select 1 from public.lfg_sites s where s.id = public.lfg_production.site_id and s.partner_id = public.lfg_partner_id())
    )
  );

-- Flip the flag on for MMDI's own partner row specifically. Safe/
-- idempotent — a no-op if no lfg_partners row is named exactly 'MMDI'.
-- To extend this to another print partner later, run the same statement
-- again with that partner's name (or target by id).
update public.lfg_partners set is_full_lifecycle_partner = true where name = 'MMDI';
