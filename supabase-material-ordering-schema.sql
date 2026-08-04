-- MMDI ONE -- Material Ordering
--
-- "I have this material ordering sheet based on program wise consumption
-- with wastage ... all this material are imported and I cannot miss them
-- for upcoming unexpected production consumptions ... Need a material
-- ordering list to send for request. Create a page where I can mention the
-- supplier and address and contact details, and make a list based on
-- programs and material that I choose."
--
-- New standalone Tools workspace (not folded into the existing Suppliers
-- scorecard or the placeholder Procurement Kanban -- neither has real data
-- or logic behind it yet, see the investigation that preceded this file).
-- Three tables:
--
--   1. material_suppliers / material_supplier_items -- the master data:
--      who supplies what, and how that material is actually packed/ordered
--      (a roll of a given width x length, a sheet of a given size, or "just
--      tell me a plain roll count"). pack_options is a jsonb array rather
--      than fixed width/length columns because different materials pack
--      completely differently (roll width+length vs sheet width+height vs
--      reel weight) -- see each seeded item in
--      supabase-material-ordering-suppliers-seed.sql for the exact shapes
--      in use.
--
--   2. material_consumption_rows -- the imported program-wise consumption
--      data (from "Import Material Purchases.xlsx"), one row per SKU. This
--      is reference data the Order Builder reads from, grouping by
--      program + material name to sum up how much of a material is needed.
--      Kept as its own table (not folded into raw_materials, which has no
--      program/consumption concept at all) so re-importing a refreshed
--      sheet is just a new batch of rows, never a destructive overwrite of
--      anything else.
--
--   3. material_orders -- a saved purchase request to one supplier, built
--      from a chosen set of programs. Like sign_estimates.calc, `lines` is
--      a frozen jsonb snapshot of the computed order (material, total
--      consumption, which pack size was used, packs ordered) rather than a
--      live join -- a sent order should keep showing exactly what was
--      requested even if consumption data or a supplier's pack sizes
--      change later. `supplier_snapshot` freezes the address/contact
--      details actually printed on that order for the same reason.
--
-- RLS: plain authenticated-only, matching supabase-estimate-pool-
-- migration.sql (an internal ops tool, not customer-facing/role-gated).
-- Idempotent (IF NOT EXISTS / dynamic DROP POLICY IF EXISTS).

create table if not exists public.material_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  address text,
  contact_person text,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now()
);

-- unit_type drives which order-quantity calculation the Order Builder uses:
--   'roll'   -- pack_options entries carry width_mm + length_m; consumption
--               is summed (linear metres) per matching width, packs_required
--               = ceil(total_length_m / length_m) for that width's pack.
--   'sheet'  -- pack_options entries carry width_mm + height_mm; consumption
--               is summed (sq.m, incl. wastage buffer) and divided by the
--               chosen pack's area, rounded up (simple area math -- not
--               nested/optimised cutting, see the header note in
--               MaterialOrderBuilderTab.tsx for why).
--   'simple' -- no consumption calculation at all; pack_options is purely
--               informational (what a "roll"/"pack" of this material is),
--               and the ordered quantity is typed in directly.
-- order_method mirrors this at the supplier-item level for display/filter
-- purposes ('consumption' vs 'simple_count') -- kept as its own column
-- (rather than only deriving it from unit_type) since 'simple' unit_type
-- items are always order_method 'simple_count', but it reads clearer with
-- both stated explicitly, matching how the user described each supplier.
create table if not exists public.material_supplier_items (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.material_suppliers (id) on delete cascade,
  material_name text not null,
  raw_material_code text,
  unit_type text not null check (unit_type in ('roll', 'sheet', 'simple')),
  order_method text not null check (order_method in ('consumption', 'simple_count')),
  pack_options jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (supplier_id, material_name)
);
create index if not exists material_supplier_items_supplier_idx on public.material_supplier_items (supplier_id);
create index if not exists material_supplier_items_material_name_idx on public.material_supplier_items (material_name);

-- One row per SKU from the imported consumption sheet. Column names mirror
-- the sheet's own headers (Product Name, SKU ID, Category, SKU Description,
-- Bill Rate, Program, Raw Material 1/2/3, SKU, Width (MM), Height (MM),
-- SQM, Per Program Order Qty (Max), Print Length, Material Width, Linear
-- Metres Count, Total Required Material incl. Wastage) so the import stays
-- a direct, auditable transcription -- any consumption-total math the
-- sheet itself already did (roll/linear materials) is carried straight
-- through in total_required_material rather than recomputed.
create table if not exists public.material_consumption_rows (
  id uuid primary key default gen_random_uuid(),
  product_name text,
  sku_id text,
  category text,
  sku_description text,
  bill_rate numeric,
  program text,
  material_1 text,
  material_2 text,
  material_3 text,
  sku text,
  width_mm numeric,
  height_mm numeric,
  sqm numeric,
  order_qty numeric,
  print_length_mm numeric,
  material_width_mm numeric,
  linear_metres numeric,
  total_required_material numeric,
  imported_at timestamptz not null default now()
);
create index if not exists material_consumption_rows_program_idx on public.material_consumption_rows (program);

create table if not exists public.material_orders (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  supplier_id uuid references public.material_suppliers (id) on delete set null,
  supplier_snapshot jsonb not null default '{}',
  programs text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'sent')),
  notes text,
  lines jsonb not null default '[]',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists material_orders_status_idx on public.material_orders (status);
create index if not exists material_orders_created_at_idx on public.material_orders (created_at desc);

-- ============================================================
-- RLS (plain authenticated-only, see header note)
-- ============================================================

DO $$
DECLARE
  pol record;
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['material_suppliers', 'material_supplier_items', 'material_consumption_rows', 'material_orders']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    FOR pol IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t || '_select_authenticated', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (true)', t || '_insert_authenticated', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t || '_update_authenticated', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (true)', t || '_delete_authenticated', t);
  END LOOP;
END $$;

-- ============================================================
-- Verification -- should show 4 policies per table, 16 rows total
-- ============================================================
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('material_suppliers', 'material_supplier_items', 'material_consumption_rows', 'material_orders')
order by tablename, cmd;
