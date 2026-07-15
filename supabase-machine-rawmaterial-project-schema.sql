-- MMDI ONE -- create the Machine / Raw Material / Project workspace schema
--
-- These 3 tables (plus their comment/approval sub-tables) were assumed to
-- already exist in production (per an earlier, unverified note in
-- PROJECT_STATUS.md) but do not -- confirmed by
-- `ERROR: 42P01: relation "machines" does not exist` when trying to run
-- import-machines.sql. This file creates all 9 tables from scratch,
-- matching the TypeScript interfaces in src/lib/supabase.ts exactly.
--
-- Written after auth was already added this session, so RLS is
-- authenticated-only from the start here (see supabase-auth-rls-migration.sql
-- for the equivalent tightening that was needed for the older tables).
-- Anyone signed in can read/write; the anon key alone cannot touch these
-- tables at all.
--
-- Safe to re-run: every statement uses IF NOT EXISTS / DROP POLICY IF EXISTS.
-- Run this BEFORE import-machines.sql (or any raw-material/project import).

-- ========== MACHINES ==========

create table if not exists machines (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  line text,
  status text not null default 'active',
  maintenance_lead text,
  oee numeric not null default 0,
  mtbf_hours numeric not null default 0,
  mttr_hours numeric not null default 0,
  uptime numeric not null default 0,
  model text,
  clamping_force text,
  shot_weight_max text,
  last_pm text,
  installed_year integer,
  vendor text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists machine_comments (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references machines(id) on delete cascade,
  author text not null,
  content text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists machine_approvals (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references machines(id) on delete cascade,
  title text not null,
  requested_by text not null,
  value text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

-- ========== RAW MATERIALS ==========

create table if not exists raw_materials (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text,
  status text not null default 'active',
  category_owner text,
  current_stock numeric not null default 0,
  reorder_point numeric not null default 0,
  lead_time_days numeric not null default 0,
  approved_suppliers integer not null default 0,
  compatible_substrates text,
  unit_cost numeric not null default 0,
  moq text,
  storage_class text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists raw_material_comments (
  id uuid primary key default gen_random_uuid(),
  raw_material_id uuid not null references raw_materials(id) on delete cascade,
  author text not null,
  content text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists raw_material_approvals (
  id uuid primary key default gen_random_uuid(),
  raw_material_id uuid not null references raw_materials(id) on delete cascade,
  title text not null,
  requested_by text not null,
  value text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

-- ========== PROJECTS ==========

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  customer text,
  project_manager text,
  status text not null default 'active',
  completion_pct numeric not null default 0,
  budget_utilization numeric not null default 0,
  schedule_health text not null default 'Green',
  open_risks integer not null default 0,
  sponsor text,
  kickoff text,
  target_completion text,
  primary_line text,
  budget numeric not null default 0,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  author text not null,
  content text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists project_approvals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  requested_by text not null,
  value text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

-- ========== RLS: authenticated-only on all 9 tables ==========

DO $$
DECLARE
  target_table text;
  pol record;
  target_tables text[] := ARRAY[
    'machines', 'machine_comments', 'machine_approvals',
    'raw_materials', 'raw_material_comments', 'raw_material_approvals',
    'projects', 'project_comments', 'project_approvals'
  ];
BEGIN
  FOREACH target_table IN ARRAY target_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);

    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = target_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, target_table);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      target_table || '_select_authenticated', target_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (true)',
      target_table || '_insert_authenticated', target_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)',
      target_table || '_update_authenticated', target_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (true)',
      target_table || '_delete_authenticated', target_table
    );

    RAISE NOTICE 'Created/secured public.%', target_table;
  END LOOP;
END $$;

-- Verification: every table above should show 4 policies, all TO authenticated.
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('machines', 'machine_comments', 'machine_approvals',
                     'raw_materials', 'raw_material_comments', 'raw_material_approvals',
                     'projects', 'project_comments', 'project_approvals')
ORDER BY tablename, cmd;
