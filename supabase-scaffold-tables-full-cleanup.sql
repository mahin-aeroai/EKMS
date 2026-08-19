-- Full sample-data cleanup across every module you flagged: CRM (already
-- wiped separately), Suppliers, SOPs, Installation, Procurement,
-- Production, Drawings, Lessons Learned, and Contracts. None of these
-- eight tables ever had a real data import committed to this project
-- (unlike customers/job_orders/sales_transactions/raw_materials/
-- finished_goods, which all did) -- confirmed via diagnose-scaffold-
-- tables-foreign-keys.sql, which also found the only FK relationship
-- touching any of them: estimates.contract_id -> contracts.id (NO
-- ACTION). Validated against a real Postgres engine (PGlite) before
-- handing this back.
--
-- Inventory (inventory_skus) is deliberately NOT included here -- it's a
-- mix of a real 789-row product catalog with a handful of never-updated
-- demo stock quantities, not pure scaffold like the rest. Flag me
-- separately if you want that one looked at.
--
-- contracts needs one extra step the others don't: it's the only one of
-- the eight with a real row mixed in (your Apple India Pvt Ltd contract,
-- added earlier this session) and the only one referenced by another
-- table (estimates.contract_id). STEP 1 clears that link on any estimate
-- that happens to point at one of the three scaffold contracts (IKEA
-- India / Godrej Interio / Reliance Retail Ltd) BEFORE deleting them, so
-- the delete can't get blocked or leave a dangling reference -- the
-- estimate itself is untouched, it just loses a link to a contract that
-- was never real anyway.
--
-- Paste the whole file into one Supabase SQL editor tab and run it once.
-- Every delete has a RETURNING clause; since the results panel only shows
-- the LAST statement's output, that'll be contracts' deleted rows --
-- re-run any earlier DELETE alone (select just that statement, Cmd+Enter)
-- if you want to see its own confirmation.

-- ============================================================
-- Suppliers, SOPs, Installation, Procurement, Production, Drawings,
-- Lessons Learned -- no dependencies anywhere, straightforward wipes.
-- ============================================================

delete from public.suppliers returning id, name;
delete from public.sops returning id, title;
delete from public.installation_sites returning id, site;
delete from public.purchase_orders returning id, title;
delete from public.work_orders returning id, title;
delete from public.drawings returning id, title;
delete from public.lessons_learned returning id, title;

-- ============================================================
-- Contracts -- clear the one real dependency first, then delete only the
-- 3 scaffold rows (Apple India Pvt Ltd is untouched).
-- ============================================================

update public.estimates
set contract_id = null
where contract_id in (
  select id from public.contracts where customer in ('IKEA India', 'Godrej Interio', 'Reliance Retail Ltd')
);

delete from public.contracts
where customer in ('IKEA India', 'Godrej Interio', 'Reliance Retail Ltd')
returning id, customer;
