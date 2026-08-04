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

-- unit_type describes the PACK SHAPE -- what a "pack" of this material
-- physically is, which drives what pack_options carries and how a chosen
-- pack converts into a packs-ordered count:
--   'roll'   -- pack_options entries carry width_mm (sometimes omitted, see
--               below) + length_m.
--   'sheet'  -- pack_options entries carry width_mm + height_mm.
--   'simple' -- pack_options is purely informational; packs_ordered has no
--               formula behind it and is typed in directly.
-- order_method mirrors this for display/filter purposes ('consumption' vs
-- 'simple_count').
--
-- consumption_basis describes HOW MUCH of the material a SKU actually
-- consumes -- a separate axis from unit_type, because materials that are
-- physically the same pack shape can be consumed completely differently
-- (a fabric roll consumed by print length is not the same math as a gasket
-- roll consumed by trim perimeter). Corrected per the user's own
-- supplier-by-supplier knowledge after reviewing the first cut of computed
-- order lists:
--   'total_required_material'   -- sum material_consumption_rows.
--         total_required_material (the sheet's own precomputed, wastage-
--         inclusive linear metres) per matching material_width_mm group.
--         The original/default basis -- correct for materials whose print
--         length was directly given in the sheet (Recycled Rhine, MT 3180,
--         Transjet Industrial).
--   'perimeter_x2'  -- consumption = 2*(width_mm + height_mm)/1000 *
--         order_qty, summed across all matching rows into one line (no
--         pack width to group by). For trim/edge materials that wrap a
--         piece's perimeter rather than its face -- Silicon Gasket,
--         Rubber Magnet. (Both of these previously either produced wrong
--         numbers or nothing at all, because they were reusing
--         total_required_material -- computed for the FACE fabric on the
--         same row, not for a perimeter trim.)
--   'qty_per_pack_by_sheet_size'  -- group matching rows by
--         material_width_mm (their sheet size), and within each group sum
--         ceil(order_qty / qty_per_pack) per row where qty_per_pack is on
--         file, falling back to sqm*order_qty / pack-area for rows without
--         it. One order line per sheet size -- sizes are never blended
--         together into a single average, and multi-up nesting (several
--         small pieces per sheet, e.g. Primex's GPS18/19) is counted
--         correctly via qty_per_pack instead of undercounted by treating
--         each sheet as one piece. For Primex Styrene.
--   'wastage_running_length'  -- per matching row, derive the running
--         length by comparing width_mm/height_mm against
--         material_width_mm (whichever side fits within the material's
--         width is the cross-web side; the other is the running length),
--         then apply a flat 40% wastage multiplier. Rows with no
--         material_width_mm on file (or where neither side fits) can't be
--         computed this way and are skipped from the running-metres total,
--         but a packs-ordered default is still suggested from any
--         qty_per_pack data those rows carry. For Sappi Magno Satin.
--   'qty_direct_wastage'  -- order_qty (per program_qty (max)) IS the
--         consumption already in metres for these bare reference rows
--         with no width/height on file (the sheet gave a running-metres
--         figure directly, not a piece count) -- apply the same flat 40%
--         wastage multiplier, sum, convert to rolls. For Endutex BWX 500
--         / Back EX Banner.
--   'sqft_direct_to_rolls'  -- order_qty is the program's total
--         consumption in SQ.FT already (again, a bare reference row with
--         no per-piece dimensions) -- convert to sq.m, divide by the
--         material's roll width to get metres, convert to rolls. For
--         Aslan DFP25 Blockout Film.
--   'fixed_pieces_per_roll'  -- a fixed, material-level (not per-SKU)
--         pieces-per-pack constant in pieces_per_pack below -- packs
--         needed per row = ceil(order_qty / pieces_per_pack), summed. For
--         Aslan SL 109 Lamination Film (200 pieces/roll).
--   'manual'  -- no consumption calculation at all (was unit_type
--         'simple''s old meaning) -- packs_ordered typed in directly,
--         though still pre-filled from qty_per_pack where a row happens to
--         carry it. For Arrow Inc's papers, Visual Magnetics.
create table if not exists public.material_supplier_items (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.material_suppliers (id) on delete cascade,
  material_name text not null,
  raw_material_code text,
  unit_type text not null check (unit_type in ('roll', 'sheet', 'simple')),
  order_method text not null check (order_method in ('consumption', 'simple_count')),
  pack_options jsonb not null default '[]',
  consumption_basis text not null default 'total_required_material' check (consumption_basis in (
    'total_required_material', 'perimeter_x2', 'qty_per_pack_by_sheet_size',
    'wastage_running_length', 'qty_direct_wastage', 'sqft_direct_to_rolls',
    'fixed_pieces_per_roll', 'manual'
  )),
  -- Only meaningful for consumption_basis = 'fixed_pieces_per_roll'.
  pieces_per_pack numeric,
  created_at timestamptz not null default now(),
  unique (supplier_id, material_name)
);
create index if not exists material_supplier_items_supplier_idx on public.material_supplier_items (supplier_id);
create index if not exists material_supplier_items_material_name_idx on public.material_supplier_items (material_name);

-- One row per SKU from the imported consumption sheet. Column names mirror
-- the sheet's own headers (Product Name, SKU ID, Category, SKU Description,
-- Bill Rate, Program, Raw Material 1/2/3, SKU, Width (MM), Height (MM),
-- SQM, Per Program Order Qty (Max), Print Length, Material Width, Linear
-- Metres Count, Total Required Material incl. Wastage, Qty can be
-- accomodated withing pack size) so the import stays a direct, auditable
-- transcription -- any consumption-total math the sheet itself already did
-- (roll/linear materials) is carried straight through in
-- total_required_material rather than recomputed.
--
-- qty_per_pack ("Qty can be accomodated withing pack size" in the sheet):
-- how many finished pieces of THIS SKU nest on one pack/sheet/reel of the
-- material, per the user's own layout knowledge -- not something we can
-- derive from width/height alone (real nesting accounts for rotation,
-- trim, etc). When present, this is a materially better basis for
-- packs-needed than the SQM/pack-area estimate (see OrderBuilderTab.tsx),
-- since it's the user's actual answer rather than a geometric guess. Only
-- some rows have it -- the sheet fills it in per-SKU as that knowledge
-- becomes available, so it's nullable and the Order Builder falls back to
-- the area estimate wherever it's missing.
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
  qty_per_pack numeric,
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
