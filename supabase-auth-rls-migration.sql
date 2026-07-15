-- MMDI ONE — tighten RLS to require authentication
-- Generated 15 July 2026. Run this in the Supabase SQL Editor
-- (Project: mahin-aeroai's Project, https://vzyrvzgtjcodxkjydxxn.supabase.co).
--
-- What this does:
--   For every table below that exists in the `public` schema, it drops
--   whatever policies currently exist (the wide-open `using (true)` ones)
--   and replaces them with four policies — select/insert/update/delete —
--   that all require `auth.uid() is not null`, i.e. any signed-in MMDI ONE
--   user can read/write, but the anon key alone can no longer touch the
--   table. This matches the "simple: authenticated-only" access model
--   (no per-role restrictions yet).
--
-- Safe to re-run: it's idempotent (drops before creating).
--
-- IMPORTANT: I generated the table list below from the TypeScript
-- interfaces in src/lib/supabase.ts, not by inspecting the live database
-- (this session's sandbox couldn't reach the Supabase API). The `customers`,
-- `customer_contacts`, `customer_comments`, `customer_approvals` tables and
-- the 16 lighter-module tables are definitely live (the app queries them
-- today). The `machines`, `machine_comments`, `machine_approvals`,
-- `raw_materials`, `raw_material_comments`, `raw_material_approvals`,
-- `projects`, `project_comments`, `project_approvals` tables are inferred
-- from the row-type interfaces and the project's naming convention
-- (customer -> customer_comments/customer_approvals) but nothing in the
-- code queries them yet, so double check they exist / are named this way
-- before running — the script below skips any table name that doesn't
-- exist, so it's safe either way, just verify nothing important got
-- silently skipped by running the verification query at the bottom first.

DO $$
DECLARE
  target_table text;
  pol record;
  target_tables text[] := ARRAY[
    'customers', 'customer_contacts', 'customer_comments', 'customer_approvals',
    'machines', 'machine_comments', 'machine_approvals',
    'raw_materials', 'raw_material_comments', 'raw_material_approvals',
    'projects', 'project_comments', 'project_approvals',
    'crm_accounts', 'quotes', 'contracts', 'work_orders', 'maintenance_events',
    'installation_sites', 'inventory_skus', 'purchase_orders', 'suppliers',
    'documents', 'drawings', 'sops', 'lessons_learned', 'employees',
    'compliance_findings', 'access_requests'
  ];
BEGIN
  FOREACH target_table IN ARRAY target_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = target_table
    ) THEN
      -- Make sure RLS is on.
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);

      -- Drop every existing policy on this table, whatever it's named.
      FOR pol IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = target_table
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, target_table);
      END LOOP;

      -- Authenticated-only CRUD.
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

      RAISE NOTICE 'Tightened RLS on public.%', target_table;
    ELSE
      RAISE NOTICE 'Skipped % (table does not exist)', target_table;
    END IF;
  END LOOP;
END $$;

-- Verification: run this after the block above to see the final policy set
-- for every table it touched. Every row should show four policies with
-- roles = {authenticated} and no more `using (true)` policies open to
-- anon/public.
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
