-- The CRM page (Customers > CRM) reads live from public.crm_accounts --
-- entirely separate from public.customers, so the earlier customers
-- cleanup never touched it. Its "Reliance Retail Ltd" row is the same
-- kind of leftover scaffold data, just in a different table.
--
-- Strong evidence this whole table is scaffold, not real: it's exactly 4
-- rows (Reliance Retail Ltd, IKEA India, Godrej Interio, Urban Ladder),
-- "Reliance Retail Ltd" already confirmed fake in the customers table,
-- "IKEA India" / "Godrej Interio" match the exact original illustrative
-- names this project's contracts table was scaffolded with (never a real
-- import), and the page's own Pipeline Value / Win Rate stat cards are
-- hardcoded to "--" in the component itself (see crm/page.tsx) -- i.e.
-- nothing here was ever wired to anything real.
--
-- STEP 1 is a preview -- confirm it's exactly those 4 (or similarly
-- generic-looking) rows before running STEP 2. STEP 2 wipes the table
-- entirely rather than deleting by name, since there's no real data here
-- to preserve.

-- ============================================================
-- STEP 1 -- preview
-- ============================================================

select * from public.crm_accounts order by name;

-- ============================================================
-- STEP 2 -- wipe (nothing real to lose here per the evidence above)
-- ============================================================

delete from public.crm_accounts returning id, name;
