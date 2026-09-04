-- MMDI ONE — new "Masters" workspace: Company / Branch / Sales Office /
-- Sales Person / Product master data (2 Sept 2026 -- Srinivas: "Lets
-- create masters — collect masters of all pages and put them in one
-- place... Company master, Branch master, Sales office master, Employee
-- master, Machinery master, Sales person master, Product master,
-- customer master, supplier master").
--
-- Run this AFTER supabase-role-based-rls-migration.sql (needs
-- public.user_role()) AND supabase-estimate-builder-schema.sql (needs
-- public.user_has_group_access() / profiles.allowed_groups — that's
-- where both were first defined, despite some older comments elsewhere
-- in this repo referring to a separate "module-access" migration file
-- that was never actually checked in).
--
-- SCOPE: only 5 of the 9 masters Srinivas listed are new tables here --
-- Customer (`customers`), Supplier (`suppliers`), Employee (`employees`),
-- and Machinery (`machines`) already exist as their own full workspaces
-- (Customer Workspace, Suppliers, People, Machines) with real data, so
-- this does NOT duplicate them — the new /workspaces/masters hub page
-- links out to those instead. This migration only adds the 5 that had
-- nowhere to live yet: Company, Branch, Sales Office, Sales Person,
-- Product.
--
-- HIERARCHY: company -> branch (optional) -> sales office (optional) ->
-- sales person (optional link to an existing `employees` row, for when
-- the sales person is also an internal employee — left null for an
-- external/agent sales person). Product stands alone (no hierarchy).
-- Every FK is nullable except company_id on branches/sales_offices --
-- a branch or sales office always belongs to a company, but a company
-- can exist with no branches yet, and a sales office needn't be pinned
-- to one specific branch.
--
-- Safe to re-run: every statement is idempotent (create-if-not-exists /
-- drop-then-recreate policies).

-- ============================================================
-- STEP 1 — tables
-- ============================================================

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  gstin text,
  pan text,
  address text,
  city text,
  state text,
  pincode text,
  phone text,
  email text,
  website text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists companies_code_key on public.companies (code) where code is not null;

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  code text,
  address text,
  city text,
  state text,
  pincode text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists branches_code_key on public.branches (code) where code is not null;
create index if not exists branches_company_idx on public.branches(company_id);

create table if not exists public.sales_offices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  name text not null,
  code text,
  region text,
  address text,
  city text,
  state text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sales_offices_code_key on public.sales_offices (code) where code is not null;
create index if not exists sales_offices_company_idx on public.sales_offices(company_id);
create index if not exists sales_offices_branch_idx on public.sales_offices(branch_id);

create table if not exists public.sales_persons (
  id uuid primary key default gen_random_uuid(),
  sales_office_id uuid references public.sales_offices(id) on delete set null,
  -- Optional link to an existing Employee-master row, for when the sales
  -- person is also an MMDI employee -- left null for an external agent.
  -- Deliberately NOT a foreign key requirement (sales_persons can be
  -- created before/without a matching employees row).
  employee_id uuid references public.employees(id) on delete set null,
  name text not null,
  code text,
  email text,
  phone text,
  designation text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sales_persons_code_key on public.sales_persons (code) where code is not null;
create index if not exists sales_persons_office_idx on public.sales_persons(sales_office_id);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  category text,
  unit text,
  hsn_code text,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists products_code_key on public.products (code) where code is not null;

-- ============================================================
-- STEP 2 — seed the 5 known MMDI divisions as Company rows
-- (KG Signs, Dovetail, Octaprint, Indura, Taasi). Idempotent via
-- `where not exists` rather than ON CONFLICT, since name isn't
-- declared unique (two genuinely different companies could share a
-- display name in theory -- code is the real unique key).
-- ============================================================

insert into public.companies (name)
select v.name
from (values ('KG Signs'), ('Dovetail'), ('Octaprint'), ('Indura'), ('Taasi')) as v(name)
where not exists (
  select 1 from public.companies c where lower(c.name) = lower(v.name)
);

-- ============================================================
-- STEP 3 — RLS: role + 'masters' group, same pattern as
-- supabase-sign-estimator-schema.sql's STEP 4 (reuses user_role()/
-- user_has_group_access(), does not redefine them). New group id
-- 'masters' needs no schema change of its own (profiles.allowed_groups
-- is a plain text[], NULL = unrestricted) -- just add "masters" to
-- GROUP_OPTIONS in workspaces/administration/page.tsx so it's
-- assignable from the Administration UI (done in the matching code
-- change, not this SQL file).
-- ============================================================

DO $$
DECLARE
  target_table text;
  required_groups text[] := array['masters'];
  pol record;
  tables text[] := array[
    'companies', 'branches', 'sales_offices', 'sales_persons', 'products'
  ];
BEGIN
  FOREACH target_table IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = target_table
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);

      FOR pol IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = target_table
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, target_table);
      END LOOP;

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_role() IN (''admin'', ''editor'', ''viewer'') AND public.user_has_group_access(%L::text[]))',
        target_table || '_select_by_role', target_table, required_groups
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_role() IN (''admin'', ''editor'') AND public.user_has_group_access(%L::text[]))',
        target_table || '_insert_by_role', target_table, required_groups
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_role() IN (''admin'', ''editor'') AND public.user_has_group_access(%L::text[])) WITH CHECK (public.user_role() IN (''admin'', ''editor'') AND public.user_has_group_access(%L::text[]))',
        target_table || '_update_by_role', target_table, required_groups, required_groups
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.user_role() = ''admin'' AND public.user_has_group_access(%L::text[]))',
        target_table || '_delete_by_role', target_table, required_groups
      );

      RAISE NOTICE 'Applied group-scoped RLS to public.%', target_table;
    ELSE
      RAISE NOTICE 'Skipped % (table does not exist)', target_table;
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- Verification queries — run after the block above
-- ============================================================

-- 1. Confirm all 5 tables exist and the seed rows landed:
--    select * from public.companies order by name;

-- 2. Confirm 20 new policies (4 per table x 5 tables):
--    select tablename, policyname, cmd from pg_policies
--    where tablename in ('companies','branches','sales_offices','sales_persons','products')
--    order by tablename, cmd;
