-- Removes leftover illustrative/scaffold rows now that real data has
-- started replacing them, and audits the other tables that likely still
-- hold generic placeholder names ("Regional Hardware Co.", "Cosmo Films",
-- etc.) from when the app was first scaffolded.
--
-- STEP 1 is safe to run as-is: employee_code is a new column that only the
-- real 498-row import (import-employees.sql) ever populates, so any row
-- where it's NULL is provably a pre-existing scaffold record, not real data.
--
-- STEPS 2+ are audit-only (SELECT, no deletes) for customers/suppliers and
-- other tables that were originally seeded with illustrative rows. I don't
-- have direct database access in this session, so I can't see what's
-- currently in them -- run the SELECTs, look at the name/title columns, and
-- tell me which rows are real vs. generic so I can write a precise DELETE
-- (or just tell me "table X is still 100% placeholder, wipe it" and I will).

-- ============================================================
-- STEP 1 — employees: safe to run now
-- ============================================================

select count(*) as scaffold_rows_to_delete from public.employees where employee_code is null;

delete from public.employees where employee_code is null;

-- ============================================================
-- STEP 2 — audit: customers
-- ============================================================
-- The Customers page was already rebuilt in an earlier session to query
-- this table live (no more hardcoded frontend record), but that doesn't
-- tell us whether the *rows* are real customers or leftover seed data.

select count(*) as customers_total from public.customers;
select id, code, name, region, tier, account_owner, lifetime_value
from public.customers
order by name
limit 50;

-- Known scaffold row from before the real 1,688-row customer import: the
-- original hardcoded demo record was "Apple India Pvt Ltd - Bangalore",
-- code C03739. Safe to delete by exact code match if it's still present.
select id, code, name from public.customers where code = 'C03739';

delete from public.customers where code = 'C03739';

-- ============================================================
-- STEP 3 — audit: suppliers
-- ============================================================
-- The Suppliers page frontend was just fixed (removed a hardcoded donut
-- chart with fake company names and fake stat cards) but no real supplier
-- data has been imported yet in this conversation -- these rows are very
-- likely still 100% the original scaffold.

select count(*) as suppliers_total from public.suppliers;
select id, name, category, on_time, status, status_label from public.suppliers order by name;

-- ============================================================
-- STEP 4 — audit: other tables likely still holding scaffold rows
-- ============================================================
-- Same original-scaffold pattern as documents/drawings/sops had before the
-- Knowledge-module import work. Uncomment/run the ones relevant to you.

-- select count(*) as machines_total from public.machines;
-- select id, name, status, status_label from public.machines order by name;

-- select count(*) as raw_materials_total from public.raw_materials;
-- select id, name, status, status_label from public.raw_materials order by name;

-- select count(*) as projects_total from public.projects;
-- select id, name, status, status_label from public.projects order by name;

-- select count(*) as crm_accounts_total from public.crm_accounts;
-- select id, name from public.crm_accounts order by name;

-- select count(*) as quotes_total from public.quotes;
-- select count(*) as contracts_total from public.contracts;
-- select count(*) as work_orders_total from public.work_orders;
-- select count(*) as installation_sites_total from public.installation_sites;
-- select count(*) as inventory_skus_total from public.inventory_skus;
-- select count(*) as purchase_orders_total from public.purchase_orders;
