-- ============================================================
-- Adds lfg_stores.hq_partner -- the reseller/franchise company that
-- operates the store (Aptronix, iMagine, iAstra, ...), mirroring
-- lfg_sites.hq_partner (see supabase-lfg-sites-hq-partner-migration.sql
-- for the full definition/reasoning). lfg_sites.hq_partner already exists
-- and is populated; this column is what lets it behave as a STORE-level
-- field going forward -- same treatment as outlet_name/format/sfo_id/
-- city/region/store_address/partner_id/ASM fields/escalation_email
-- already get in lfg_stores + LfgSiteWorkspaceClient.tsx's SiteInfoCard
-- (a change propagates to the store row AND every sibling display sharing
-- it), which is exactly the property the new "Takeover" action needs: a
-- store's reseller changing (Aptronix -> iMagine, say) has to move every
-- display at that store together, not just the one site someone happened
-- to open.
--
-- 19-22 Sept 2026 task feedback (Mahin, verbatim): "Introduce principle
-- Apple Partners : Like Aptronix, iMagine iAstra some times that stores
-- taken over between Apple partners and the name is changing but rest all
-- detail remains same. So need provision to switch and takeover action."
--
-- Purely additive, safe to run any time. No existing column/table is
-- touched. Backfills every store from whichever of its own sites already
-- has hq_partner set (a store's sites should already agree on this in
-- practice, since hq_partner was only ever imported at the site level so
-- far -- MAX() just picks a non-null value deterministically if they
-- somehow don't).
-- ============================================================

alter table public.lfg_stores
  add column if not exists hq_partner text;

update public.lfg_stores st
set hq_partner = sub.hq_partner
from (
  select store_id, max(hq_partner) as hq_partner
  from public.lfg_sites
  where store_id is not null and hq_partner is not null
  group by store_id
) sub
where sub.store_id = st.id
  and st.hq_partner is null;
