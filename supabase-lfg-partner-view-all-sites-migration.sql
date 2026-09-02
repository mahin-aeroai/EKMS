-- LFG Connect: let a partner see every partner's sites, read-only
-- (Cards/Program-filter/"All Sites" toggle feature, 2 Sept 2026 -- see
-- PROJECT_STATUS.md and /root/.claude/plans/reactive-singing-abelson.md)
--
-- WHAT THIS CHANGES
-- Widens ONLY the lfg_sites SELECT policy. Today a genuine partner
-- account (is_lfg_partner_user() true, is_mmdi_staff() false) can only
-- ever see rows where partner_id = lfg_partner_id() -- a real
-- query-level block, not just a UI restriction. The new partner home
-- page adds a "My Sites / All Sites" toggle that needs every partner's
-- sites to actually come back from the query when it's switched on.
--
-- is_lfg_partner_user() already exists (defined earlier in
-- supabase-lfg-site-management-schema.sql) -- this migration only
-- redefines the one policy that reads it.
--
-- WHAT THIS DELIBERATELY DOES NOT CHANGE
-- lfg_sites_insert / lfg_sites_update / lfg_sites_delete_staff and the
-- lfg_sites_guard_partner_update() BEFORE UPDATE trigger are untouched --
-- writes stay scoped to a partner's own sites exactly as before. Every
-- child table's own RLS (lfg_site_surveys, lfg_site_documents,
-- lfg_production, lfg_installations, lfg_installation_photos,
-- lfg_shipments, lfg_issues, lfg_deactivation_requests,
-- lfg_site_status_history) is also untouched -- all of those stay scoped
-- to `partner_id = lfg_partner_id()`.
--
-- CONSEQUENCE (expected, not a bug): a partner who opens another
-- partner's site from the new "All Sites" view will see that site's
-- master fields (status, location, material, size, ASM contact info)
-- but every related tab -- Survey, Documents, Shipments, Installation
-- Photos, Issues, History -- will load empty, because those tables'
-- RLS still only allows the owning partner to read their own rows.
--
-- HOW TO APPLY
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor ->
-- New query -> paste -> Run). No app restart needed -- RLS policies
-- take effect immediately for new queries.

drop policy if exists lfg_sites_select on public.lfg_sites;

create policy lfg_sites_select on public.lfg_sites
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or partner_id = public.lfg_partner_id()
    or public.is_lfg_partner_user()
  );
