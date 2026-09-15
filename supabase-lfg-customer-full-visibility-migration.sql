-- ============================================================
-- LFG Connect: full-visibility "customer" account for Apple
--
-- Task feedback (Mahin, verbatim): "We need a partner account infact
-- customer account where he can see all site at once. Apple wanted to
-- see them. so give prevelege to see whoever logged in as Apple."
--
-- CONTEXT -- what already exists (do not re-read as new):
-- supabase-lfg-partner-view-all-sites-migration.sql (2 Sept 2026) already
-- widened lfg_sites_select so ANY signed-in partner (Apple included) can
-- toggle "All Sites" on the Site Master and see every site's MASTER
-- fields (status, location, material, size, ASM contact). That migration
-- deliberately left every CHILD table (Survey, Documents, Shipments,
-- Installation, Installation Photos, Issues, Status History) still
-- scoped to `partner_id = lfg_partner_id()` -- its own header comment
-- calls this "expected, not a bug": a real installation partner (IandS)
-- browsing another installer's (MMDI's) site from the All-Sites list
-- should NOT see that installer's survey/shipment/installation detail.
--
-- That's the gap this migration closes, but ONLY for accounts explicitly
-- flagged as a full-visibility "customer" account -- not for every
-- partner. Apple isn't a competing installer whose operational detail
-- needs to stay private from other installers; Apple is the actual
-- client, so seeing every site's full detail across every installation
-- partner is exactly what was asked for. Opening the same thing to
-- IandS or MMDI's own partner login would leak each other's operational
-- detail, which is NOT the ask here.
--
-- WHAT THIS CHANGES
-- New lfg_partners.can_view_all_site_details flag (default false -- every
-- existing/future partner stays exactly as scoped as before unless
-- explicitly flagged), a new lfg_partner_can_view_all_site_details()
-- helper (same style as lfg_partner_is_full_lifecycle() in
-- supabase-lfg-full-lifecycle-partner-migration.sql), and the flagged
-- partner is OR'd into the SELECT policy of every child table that was
-- left untouched by the Sept 2 migration, plus lfg_stores (not touched by
-- that migration either, but the same "master data, safe to see"
-- reasoning applies). Read-only -- INSERT/UPDATE/DELETE policies on every
-- one of these tables are completely untouched, so a full-visibility
-- account still cannot edit anything outside sites actually assigned to
-- its own partner_id (which for Apple, having no sites of its own, is
-- nothing at all -- this account is view-only in practice).
--
-- DELIBERATELY NOT TOUCHED (per lfg-auth.ts's own "SECURITY REMINDER"):
-- lfg_site_financials and lfg_installation_costs. Those stay admin/editor
-- only, full stop -- a customer-visibility account must never see MMDI's
-- internal cost/margin data, regardless of this flag.
--
-- HOW TO APPLY
-- Run this once in the Supabase SQL Editor. No app restart needed.
-- Idempotent and safe to re-run.
-- ============================================================

alter table public.lfg_partners
  add column if not exists can_view_all_site_details boolean not null default false;

create or replace function public.lfg_partner_can_view_all_site_details()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.can_view_all_site_details
       from public.lfg_partner_users u
       join public.lfg_partners p on p.id = u.partner_id
      where u.id = auth.uid()),
    false
  )
$$;

-- ---- lfg_stores: add the full-visibility carve-out -----------------------
drop policy if exists lfg_stores_select on public.lfg_stores;
create policy lfg_stores_select on public.lfg_stores
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or partner_id = public.lfg_partner_id()
    or public.lfg_partner_can_view_all_site_details()
  );

-- ---- lfg_site_status_history ----------------------------------------------
drop policy if exists lfg_site_status_history_select on public.lfg_site_status_history;
create policy lfg_site_status_history_select on public.lfg_site_status_history
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_site_status_history.site_id and s.partner_id = public.lfg_partner_id())
    or public.lfg_partner_can_view_all_site_details()
  );

-- ---- lfg_site_surveys ------------------------------------------------------
drop policy if exists lfg_site_surveys_select on public.lfg_site_surveys;
create policy lfg_site_surveys_select on public.lfg_site_surveys
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_site_surveys.site_id and s.partner_id = public.lfg_partner_id())
    or public.lfg_partner_can_view_all_site_details()
  );

-- ---- lfg_site_documents -----------------------------------------------------
drop policy if exists lfg_site_documents_select on public.lfg_site_documents;
create policy lfg_site_documents_select on public.lfg_site_documents
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_site_documents.site_id and s.partner_id = public.lfg_partner_id())
    or public.lfg_partner_can_view_all_site_details()
  );

-- ---- lfg_production: read only -- write policy is completely untouched ----
drop policy if exists lfg_production_select on public.lfg_production;
create policy lfg_production_select on public.lfg_production
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_production.site_id and s.partner_id = public.lfg_partner_id())
    or public.lfg_partner_can_view_all_site_details()
  );

-- ---- lfg_installations: SELECT policy only. lfg_installations_write -------
-- (the combined all-actions policy) is untouched -- a full-visibility
-- account can read every installation row but still cannot write one
-- outside sites actually assigned to its own partner_id.
drop policy if exists lfg_installations_select on public.lfg_installations;
create policy lfg_installations_select on public.lfg_installations
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_installations.site_id and s.partner_id = public.lfg_partner_id())
    or public.lfg_partner_can_view_all_site_details()
  );

-- ---- lfg_installation_photos ------------------------------------------------
drop policy if exists lfg_installation_photos_select on public.lfg_installation_photos;
create policy lfg_installation_photos_select on public.lfg_installation_photos
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_installation_photos.site_id and s.partner_id = public.lfg_partner_id())
    or public.lfg_partner_can_view_all_site_details()
  );

-- ---- lfg_shipments: SELECT policy only. lfg_shipments_write untouched -----
drop policy if exists lfg_shipments_select on public.lfg_shipments;
create policy lfg_shipments_select on public.lfg_shipments
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_shipments.site_id and s.partner_id = public.lfg_partner_id())
    or public.lfg_partner_can_view_all_site_details()
  );

-- ---- lfg_shipment_events -----------------------------------------------------
drop policy if exists lfg_shipment_events_select on public.lfg_shipment_events;
create policy lfg_shipment_events_select on public.lfg_shipment_events
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (
      select 1 from public.lfg_shipments sh join public.lfg_sites s on s.id = sh.site_id
      where sh.id = shipment_id and s.partner_id = public.lfg_partner_id()
    )
    or public.lfg_partner_can_view_all_site_details()
  );

-- ---- lfg_issues: SELECT policy only. lfg_issues_update stays staff-only ---
drop policy if exists lfg_issues_select on public.lfg_issues;
create policy lfg_issues_select on public.lfg_issues
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_issues.site_id and s.partner_id = public.lfg_partner_id())
    or public.lfg_partner_can_view_all_site_details()
  );

-- ---- lfg_deactivation_requests ------------------------------------------------
drop policy if exists lfg_deactivation_requests_select on public.lfg_deactivation_requests;
create policy lfg_deactivation_requests_select on public.lfg_deactivation_requests
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_deactivation_requests.site_id and s.partner_id = public.lfg_partner_id())
    or public.lfg_partner_can_view_all_site_details()
  );

-- Flip the flag on for the existing "Apple" partner row specifically.
-- Safe/idempotent -- a no-op if no lfg_partners row is named exactly
-- 'Apple'. To extend this to another genuine customer-visibility account
-- later, run the same statement again with that partner's name (or
-- target by id).
update public.lfg_partners set can_view_all_site_details = true where name = 'Apple';
