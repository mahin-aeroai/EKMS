-- ============================================================
-- LFG Connect — Estimates: shipping cost line + install execution/vendor/PO
-- ============================================================
--
-- Context: Srinivas asked for a "Generate estimate for submission to
-- customer" feature in LFG Connect admin, covering printing, packing,
-- shipping, installation costs and taxes -- and separately, for MMDI-
-- installed sites specifically, a way to mark whether a given site is
-- installed by MMDI directly or handed off to an outsourced 3rd-party
-- vendor under a purchase order (vendors to be fixed and POs shared once
-- decided). First deliverable: a downloadable Excel of all costing
-- details per site from a new "Estimates" tab.
--
-- lfg_site_financials and lfg_installation_costs already model almost all
-- of this (rate/amount/packing_forwarding/other_charges/gst_amount on the
-- printing side; installation_rate/scaffolding/travelling/gst on the
-- installation side) -- see that table's own header comment in
-- supabase-lfg-site-management-schema.sql. Two things are missing:
--
-- 1. An explicit shipping cost line -- today shipping is folded into
--    lfg_site_financials.other_charges/total_project_cost with no field
--    of its own, but the estimate needs to show it as its own line.
--
-- 2. Who executes an MMDI-attributed install. lfg_sites.partner_id
--    already answers "who installed this site" at a coarse level (MMDI
--    vs I&S vs any other channel partner -- see
--    supabase-lfg-add-mmdi-partner-migration.sql), but that's a level up
--    from what's being asked here: among sites currently attributed to
--    MMDI, some will now be handed to a 3rd-party install vendor under a
--    PO while others stay genuinely in-house. That's a new, finer-grained
--    fact, plus PO details, that partner_id can't carry.
--
-- These new fields go on lfg_installation_costs, NOT lfg_installations --
-- deliberately. lfg_installation_costs already has zero RLS grant to
-- lfg_partner (admin/editor only, see supabase-lfg-site-management-
-- schema.sql lines ~1318-1322), while lfg_installations IS partner-
-- readable (a partner can see+update their own site's installation
-- status/dates). Putting vendor/PO/cost-adjacent data on lfg_installations
-- would leak which 3rd-party vendor MMDI is routing work to, and at what
-- PO amount, to whichever partner currently holds that site's partner_id
-- -- exactly the kind of leak lfg_site_financials/lfg_installation_costs
-- were split out to prevent in the first place. lfg_installation_costs'
-- existing "staff all" RLS policy already covers every column on the
-- table, new ones included -- no RLS changes needed here.
--
-- Both ALTERs are additive (add column if not exists on existing
-- primary-keyed tables) -- safe to re-run, no backfill required.
-- ============================================================

alter table public.lfg_site_financials
  add column if not exists shipping_amount numeric;

comment on column public.lfg_site_financials.shipping_amount is
  'Freight/shipping cost, broken out as its own line for the customer estimate. Previously folded into other_charges/total_project_cost with no field of its own; null for every existing row until filled in.';

alter table public.lfg_installation_costs
  add column if not exists install_execution text check (install_execution in ('mmdi_direct', 'outsourced_vendor')),
  add column if not exists outsourced_vendor_partner_id uuid references public.lfg_partners(id),
  add column if not exists po_number text,
  add column if not exists po_date date,
  add column if not exists po_amount numeric,
  add column if not exists po_notes text;

comment on column public.lfg_installation_costs.install_execution is
  'Only meaningful for sites currently attributed to MMDI (lfg_sites.partner_id = the "MMDI" lfg_partners row): whether THIS site''s install stays in-house (mmdi_direct) or is handed to a 3rd-party vendor (outsourced_vendor, see outsourced_vendor_partner_id/po_* below). Null = not yet decided.';
comment on column public.lfg_installation_costs.outsourced_vendor_partner_id is
  'The 3rd-party install vendor this site was handed to, when install_execution = outsourced_vendor. References lfg_partners (the same table channel/installation partners already live in) rather than a new vendor table -- a vendor with no row yet is just added there first, same as MMDI/I&S were.';
