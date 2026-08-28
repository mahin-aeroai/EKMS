-- ============================================================
-- LFG Connect — clean up orphaned lfg_stores rows
-- ============================================================
--
-- Bug: deleting a site (Site Master or Site 360) only ever removed its
-- lfg_sites row, never the lfg_stores row it belonged to. If that was the
-- store's LAST remaining site, the store row was left behind as an orphan
-- -- but it still holds its SFO ID, name, city, etc. forever, and
-- lfg_stores.sfo_id is unique (where set). That's exactly what blocked
-- saving "Imagine, Bhartiya Mall Of Bengaluru" (LFG-000192, SFO 3579615):
-- an earlier "duplicate" site (LFG-000034, store "Imagine, Bhartiya
-- City") was deleted, but its store row survived, still holding SFO
-- 3579615, so no other store could ever claim that SFO ID again.
--
-- Fixed going forward in code (both delete-site paths now clean up a
-- newly-orphaned store automatically). This is the one-time catch-up for
-- orphans that already exist from before that fix.
--
-- Safe to re-run -- the DELETE below only ever touches rows with zero
-- lfg_sites referencing them (confirmed by the PREVIEW query using the
-- exact same condition), and lfg_sites.store_id -> lfg_stores.id has no
-- FK on it that would let this delete succeed if a site still pointed at
-- one of these rows in some way this query didn't already account for --
-- it would fail loudly (foreign key violation) instead of silently
-- breaking anything.
--
-- ============================================================

-- ============================================================
-- PREVIEW — every orphaned store on file right now
-- ============================================================

select st.id, st.store_name, st.sfo_id, st.city, st.created_at
from public.lfg_stores st
where not exists (select 1 from public.lfg_sites s where s.store_id = st.id)
order by st.created_at;

-- ============================================================
-- DELETE — remove them
-- ============================================================

delete from public.lfg_stores st
where not exists (select 1 from public.lfg_sites s where s.store_id = st.id);
