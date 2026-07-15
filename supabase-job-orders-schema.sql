-- MMDI ONE — Job Orders workspace schema (replaces the generic "Projects"
-- workspace, which never fit MMDI's actual unit of work).
--
-- Background: MMDI runs job orders, not "projects" in the sponsor/budget/
-- schedule-health sense the original `projects` table assumed. This table
-- is purpose-built around a real production report
-- ("Production Report FY2026_Q1.xlsx", a Hyderabad-plant job-order-level
-- production log, 10,055 line items across 2,072 distinct job orders,
-- Apr–Jun 2026). One row here = one job order header, aggregated from
-- however many production lines (substrates/products) that job order had
-- (average ~5, max 220) — see import-job-orders.sql for the aggregation.
--
-- Written after the role-based RLS migration
-- (supabase-role-based-rls-migration.sql) was already run in production,
-- so RLS here is role-aware from the start: any signed-in user with a
-- profile can read, admin/editor can write, admin only can delete. (The
-- machine/raw-material/project schema file, written earlier, only had
-- authenticated-only RLS baked in — this one is ahead of that.)
--
-- Safe to re-run: IF NOT EXISTS / DROP POLICY IF EXISTS throughout.

create table if not exists public.job_orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,          -- "Job Order No" from the source file, e.g. "745"
  name text not null,                 -- friendly label, e.g. "Job Order 745 — Emboss Marketing LLP"
  customer_name text not null,        -- raw customer name exactly as it appears in the source file
  customer_id uuid references public.customers(id), -- set ONLY on a confident exact-name match; NULL otherwise (see import file for match methodology — deliberately not fuzzy-matched)
  location text,                      -- plant location, e.g. "HYDERABAD" (this file is Hyderabad-only)
  sales_person text,
  application text,
  status text not null default 'unknown', -- inferred from the source's Job Status code ('C'/'I'); see import file comments — meaning not confirmed with the user
  order_date date,
  production_start date,
  production_end date,
  primary_machine text,               -- most frequent Machine across this job order's lines
  primary_machine_group text,         -- most frequent Machine Group across this job order's lines
  line_item_count integer not null default 0,
  total_qty numeric not null default 0,
  total_sqft numeric not null default 0,
  total_value numeric not null default 0, -- sum of (Sqft or Qty) x Rate per line, whichever the line's Price Type says
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.job_order_comments (
  id uuid primary key default gen_random_uuid(),
  job_order_id uuid not null references public.job_orders(id) on delete cascade,
  author text not null,
  content text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.job_order_approvals (
  id uuid primary key default gen_random_uuid(),
  job_order_id uuid not null references public.job_orders(id) on delete cascade,
  title text not null,
  requested_by text not null,
  value text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

-- ========== RLS: role-aware (matches supabase-role-based-rls-migration.sql) ==========

DO $$
DECLARE
  target_table text;
  pol record;
  target_tables text[] := ARRAY[
    'job_orders', 'job_order_comments', 'job_order_approvals'
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
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_role() IN (''admin'', ''editor'', ''viewer''))',
      target_table || '_select_by_role', target_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_role() IN (''admin'', ''editor''))',
      target_table || '_insert_by_role', target_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_role() IN (''admin'', ''editor'')) WITH CHECK (public.user_role() IN (''admin'', ''editor''))',
      target_table || '_update_by_role', target_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.user_role() = ''admin'')',
      target_table || '_delete_by_role', target_table
    );

    RAISE NOTICE 'Created/secured public.%', target_table;
  END LOOP;
END $$;

-- IMPORTANT: this depends on public.user_role() existing, which
-- supabase-role-based-rls-migration.sql creates. Run that migration BEFORE
-- this file if it hasn't already been run (it has, per this session's
-- history — confirmed live 15 July 2026).

-- Verification: every table above should show 4 policies, all TO authenticated.
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('job_orders', 'job_order_comments', 'job_order_approvals')
ORDER BY tablename, cmd;
