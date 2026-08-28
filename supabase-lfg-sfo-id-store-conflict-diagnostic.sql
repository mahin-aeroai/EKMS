-- ============================================================
-- LFG Connect — diagnostic: "duplicate key value violates unique
-- constraint lfg_stores_sfo_id_key" on Site 360's Site Details save
-- ============================================================
--
-- Read-only. Run in the Supabase SQL Editor, paste the results back.
--
-- Context: lfg_stores.sfo_id is unique (where set) -- one store can't
-- claim an SFO ID another store already has. Site 360's Site Details
-- form pre-fills SFO ID from the SITE's own sfo_id (lfg_sites.sfo_id),
-- then on Save writes it onto that site's STORE row (lfg_stores.sfo_id).
-- If a site's own sfo_id doesn't match what its store is actually
-- carrying -- because it already collides with a DIFFERENT store's SFO
-- ID -- opening that site and hitting Save (even with no changes) fails
-- with exactly this error.
--
-- ============================================================

-- ============================================================
-- QUERY 1 — the actual conflict(s): sites whose own sfo_id already
-- belongs to a DIFFERENT store than the one they're linked to. This is
-- almost certainly the specific site you were editing when you hit the
-- error.
-- ============================================================

select
  s.site_id,
  s.outlet_name as site_outlet_name,
  s.sfo_id as site_sfo_id,
  own.id as own_store_id,
  own.store_name as own_store_name,
  own.sfo_id as own_store_sfo_id,
  other.id as conflicting_store_id,
  other.store_name as conflicting_store_name
from public.lfg_sites s
join public.lfg_stores own on own.id = s.store_id
join public.lfg_stores other on other.sfo_id = s.sfo_id and other.id <> own.id
where s.sfo_id is not null and s.sfo_id <> ''
order by s.outlet_name;

-- ============================================================
-- QUERY 2 — broader data-quality check: every site whose own sfo_id
-- simply doesn't match its store's sfo_id (includes Query 1's rows, plus
-- any drift that hasn't caused a save failure yet because it doesn't
-- collide with anyone -- worth a look, but not urgent the way Query 1 is)
-- ============================================================

select
  s.site_id,
  s.outlet_name as site_outlet_name,
  s.sfo_id as site_sfo_id,
  st.store_name,
  st.sfo_id as store_sfo_id
from public.lfg_sites s
join public.lfg_stores st on st.id = s.store_id
where s.sfo_id is distinct from st.sfo_id
order by s.outlet_name;
