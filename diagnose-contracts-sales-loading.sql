-- MMDI ONE — diagnose "Contracts" / "Sales by Rep" not loading data
-- Run this whole file in the Supabase SQL Editor (it runs as postgres, so
-- every SELECT below bypasses RLS — this tells us whether the data exists
-- at all, separately from whether your logged-in account is allowed to
-- read it).
--
-- Read the six result sets top to bottom. What each one tells you:
--   1/2 — does the underlying data actually exist?
--   3   — is RLS even turned on, and are there policies at all?
--   4   — exact policy text on both tables (SELECT policies only)
--   5   — your profile's role + allowed_groups (the two things RLS checks)
--   6   — every profile, in case a different account is the one signed in
--         in the browser than the one you expect

-- 0. Does profiles.allowed_groups even exist yet? (supabase-module-access-
--    migration.sql adds it — if this returns 0 rows, that migration hasn't
--    been run, group-scoping doesn't apply yet, and queries 5/6 below will
--    error on the missing column — just skip them in that case.)
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'allowed_groups';

-- 1. Does contracts have rows?
select count(*) as contracts_row_count from public.contracts;

-- 2. Does sales_transactions have rows?
select count(*) as sales_transactions_row_count from public.sales_transactions;

-- 3. Is RLS enabled on each, and how many policies exist?
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('contracts', 'sales_transactions');

-- 4. The actual SELECT policy definitions on both tables
select schemaname, tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('contracts', 'sales_transactions')
  and cmd = 'SELECT';

-- 5. Your own profile — role and allowed_groups control whether RLS lets
--    you read these two tables (need role in admin/editor/viewer AND
--    allowed_groups either NULL or containing 'customers' or 'finance')
select id, email, role, allowed_groups, created_at
from public.profiles
where email = 'srinivas@mmdi.in';

-- 6. Every profile, so you can see if a different/older account is what's
--    actually signed into the browser right now
select email, role, allowed_groups from public.profiles order by email;
