-- MMDI ONE -- Cost Sheet module schema
--
-- WHAT THIS IS
-- Per PROJECT_STATUS.md's "Next up" scoping questions (answered by the user
-- at the start of this session): a NEW standalone Tools workspace, not an
-- extension of Sign Estimator's CostSheetTab (which only re-renders one
-- saved estimate's frozen JSON) or the Costing dashboard (which shows
-- supply-chain pulse, not per-job cost/margin, for want of exactly this
-- schema). Wired to real data from the start, using a BOM + Work Centre
-- cost model (material lines + work-centre process costs per FG), not
-- Estimate Builder's simpler rate/qty/shipping/installation-per-line model.
--
-- This ports the same logic already built and verified as an Excel workbook
-- this session ("FG Cost Sheet - Macro Media Digital Imaging.xlsx", from the
-- user's "FG Codes BOM Specs.xlsx" + a Jan-Jun 2026 purchase register export)
-- into MMDI ONE's own schema, so the Cost Sheet workspace can read live data
-- instead of a spreadsheet.
--
-- TABLES
--   bom_templates       - one row per FG "recipe" (33 seeded, e.g. 'SLSD-Flex'
--                         = Digital Solvent Frontlit Flex). Note this is a
--                         PRODUCT-TYPE template, not a specific inventory_skus
--                         row -- the FG Codes BOM Specs source file names
--                         product families/recipes, while inventory_skus
--                         holds 785 specific named SKUs from the Tally import.
--                         A future pass could link the two (add a
--                         bom_template_id FK on inventory_skus); out of scope
--                         here since that mapping wasn't provided.
--   bom_template_lines  - material lines per template (139 seeded). Each line
--                         optionally points at a real raw_materials.code via
--                         raw_material_code -- deliberately left NULL for any
--                         line where the BOM's shorthand material name (e.g.
--                         "RSD Flex 340GSM") didn't have a confident 1:1 match
--                         in raw_materials (see suggested_codes for
--                         candidates found by keyword search). Map via the
--                         Cost Sheet workspace's BOM Master tab.
--   work_centre_rates  - cost per sqft/piece at each of the 16 work centres,
--                         keyed by (work_centre, print_mode, substrate) (57
--                         seeded rows). confidence = 'confirmed' (from the
--                         user's own sample cost sheet), 'extrapolated' (same
--                         flat rate applied to a substrate the sample didn't
--                         cover -- needs verification), or 'missing' (no
--                         reference data, rate is NULL, must be entered).
--
-- raw_materials gets 4 new columns (unit_cost_recent/_avg/_recent_date/
-- _source) backfilled by supabase-cost-sheet-unit-cost-backfill.sql for the
-- 399 (of ~1,558) items actually purchased in the Jan-Jun 2026 register --
-- see that file's own header. unit_cost (the existing column, previously
-- always 0/NULL per import-raw-materials.sql's header comment) is set equal
-- to unit_cost_recent for those 399 so any existing UI reading unit_cost
-- keeps working; it is NOT touched for the other ~1,159 items.
--
-- RLS
-- Plain authenticated-only (matches supabase-auth-rls-migration.sql's
-- baseline), NOT gated to a business-data group -- the "Tools" nav section
-- these workspaces live under is deliberately ungated (see AppShell.tsx's
-- SECTION_GROUP comment: "a grab-bag of standalone browser utilities that
-- don't map to one business-data group"), same reasoning applied here as
-- for cut-file-tool/qr-label-tool. If MMDI later wants this restricted to
-- (say) the 'manufacturing' group like raw_materials itself, swap the plain
-- `authenticated` policies below for the group-scoped DO-block pattern in
-- supabase-sign-estimator-schema.sql.
--
-- Run this file BEFORE supabase-cost-sheet-seed.sql and
-- supabase-cost-sheet-unit-cost-backfill.sql. Idempotent throughout
-- (IF NOT EXISTS / DROP POLICY IF EXISTS).

-- ============================================================
-- STEP 1 -- raw_materials: add recent/average cost columns
-- ============================================================

alter table public.raw_materials
  add column if not exists unit_cost_recent numeric,
  add column if not exists unit_cost_recent_date date,
  add column if not exists unit_cost_avg numeric,
  add column if not exists unit_cost_source text;

comment on column public.raw_materials.unit_cost_recent is
  'Rate from the most recent purchase of this item (see unit_cost_source). NULL if never purchased in the imported window.';
comment on column public.raw_materials.unit_cost_avg is
  'Quantity-weighted average purchase rate across the imported window.';

-- ============================================================
-- STEP 2 -- bom_templates
-- ============================================================

create table if not exists public.bom_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,               -- e.g. 'SLSD-Flex'
  description text not null,               -- e.g. 'Digital Solvent Frontlit Flex - 340 GSM'
  category text not null,                  -- e.g. 'Solvent Print Signage'
  print_mode text not null,                -- e.g. 'Frontlit Print', 'Backlit Print', 'N/A (No Print)'
  substrate_type text not null,            -- e.g. 'Flex', 'Vinyl', 'Fabric', 'Rigid Board'
  work_centres text[] not null default '{}', -- applicable work centre labels, e.g. {'WC1A Solvent Printing','WC7 Seaming',...}
  created_at timestamptz not null default now()
);

-- ============================================================
-- STEP 3 -- bom_template_lines
-- ============================================================

create table if not exists public.bom_template_lines (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.bom_templates(id) on delete cascade,
  line_no integer not null,
  material_name text not null,             -- BOM shorthand, e.g. 'RSD Flex 340GSM'
  material_category text,                  -- Substrate / Ink / Transfer Paper / Rigid Substrate / Keder-Trim / Aluminium-Profile / LED-Electrical / Hardware-Fastener / Flag Accessory / Blind Hardware / Other
  raw_material_code text references public.raw_materials(code),
  suggested_codes text,                    -- candidate raw_materials codes found by keyword search -- NOT a confirmed mapping, shown as a hint in the UI
  basis text not null default 'per_sqft' check (basis in ('per_sqft', 'per_piece')),
  consumption_qty numeric not null default 0,
  wastage_pct numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (template_id, line_no)
);

create index if not exists bom_template_lines_template_id_idx on public.bom_template_lines(template_id);
create index if not exists bom_template_lines_raw_material_code_idx on public.bom_template_lines(raw_material_code);

-- ============================================================
-- STEP 4 -- work_centre_rates
-- ============================================================

create table if not exists public.work_centre_rates (
  id uuid primary key default gen_random_uuid(),
  work_centre text not null,               -- e.g. 'WC1A Solvent Printing'
  print_mode text not null default '-',    -- '-' for work centres whose rate doesn't vary by print mode
  substrate text not null,                 -- 'Flex', 'Vinyl', 'Fabric', 'Rigid Board', 'Paper', 'Aluminium/Profile', 'Other'
  rate_basis text not null default 'per_sqft' check (rate_basis in ('per_sqft', 'per_piece')),
  rate numeric,                            -- NULL where confidence = 'missing'
  confidence text not null default 'missing' check (confidence in ('confirmed', 'extrapolated', 'missing')),
  note text,
  created_at timestamptz not null default now(),
  unique (work_centre, print_mode, substrate)
);

-- ============================================================
-- STEP 5 -- RLS (plain authenticated-only, see header note)
-- ============================================================

DO $$
DECLARE
  target_table text;
  pol record;
  tables text[] := array['bom_templates', 'bom_template_lines', 'work_centre_rates'];
BEGIN
  FOREACH target_table IN ARRAY tables LOOP
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

    RAISE NOTICE 'Applied authenticated-only RLS to public.%', target_table;
  END LOOP;
END $$;

-- ============================================================
-- Verification -- should show 4 policies per table, 12 rows total
-- ============================================================
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('bom_templates', 'bom_template_lines', 'work_centre_rates')
order by tablename, cmd;
