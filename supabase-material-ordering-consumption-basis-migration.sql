-- MMDI ONE -- Material Ordering: add consumption_basis + pieces_per_pack to
-- material_supplier_items, and correct the calculation each of the user's
-- 16 seeded materials should use.
--
-- The first cut of the Order Builder assumed every 'roll' material's
-- consumption could be read straight off material_consumption_rows.
-- total_required_material, and every 'sheet' material could be reduced to
-- one blended sq.m/pack-area estimate. After reviewing real computed order
-- lists, the user corrected both assumptions per-supplier -- see
-- supabase-material-ordering-schema.sql's header comment for the full
-- explanation of each consumption_basis value. This migration adds the
-- column (default 'total_required_material', i.e. a no-op for materials
-- that were already correct) and then updates the specific materials that
-- needed a different formula.
--
-- Idempotent: `add column if not exists`, and every update is a plain
-- `set consumption_basis = ... where material_name = ...` (safe to re-run).

alter table public.material_supplier_items
  add column if not exists consumption_basis text not null default 'total_required_material';

alter table public.material_supplier_items
  drop constraint if exists material_supplier_items_consumption_basis_check;
alter table public.material_supplier_items
  add constraint material_supplier_items_consumption_basis_check check (consumption_basis in (
    'total_required_material', 'perimeter_x2', 'qty_per_pack_by_sheet_size',
    'wastage_running_length', 'qty_direct_wastage', 'sqft_direct_to_rolls',
    'fixed_pieces_per_roll', 'manual'
  ));

alter table public.material_supplier_items
  add column if not exists pieces_per_pack numeric;

-- Roffelsen / Silicon Gasket, Magnum Magnetics / Rubber Magnet -- trim
-- perimeter (2*(width+height)*qty), not the fabric's total_required_material.
update public.material_supplier_items
set consumption_basis = 'perimeter_x2'
where material_name in ('Silicon Gasket', 'Rubber Magnet');

-- Primex Plastics / Styrene -- per-sheet-size grouping, nesting-first.
update public.material_supplier_items
set consumption_basis = 'qty_per_pack_by_sheet_size'
where material_name = 'Primex - Styrene';

-- Sappi Mills / Magno Satin -- running metres derived from width/height vs
-- material width, +40% wastage.
update public.material_supplier_items
set consumption_basis = 'wastage_running_length'
where material_name = '350GSM, Sappi-Magno Satin';

-- Endutex -- order_qty is already a running-metres figure on these bare
-- reference rows; +40% wastage, convert to rolls.
update public.material_supplier_items
set consumption_basis = 'qty_direct_wastage'
where material_name in ('Endutex BWX 500', 'Endutex Back EX Banner');

-- Aslan DFP25 Blockout Film -- order_qty is total SQ.FT for the program;
-- convert via the roll's width to metres, then to rolls.
update public.material_supplier_items
set consumption_basis = 'sqft_direct_to_rolls'
where material_name = 'Aslan DFP25 Blockout Film';

-- Aslan SL 109 Lamination Film -- fixed 200 pieces produced per roll,
-- regardless of piece size.
update public.material_supplier_items
set consumption_basis = 'fixed_pieces_per_roll', pieces_per_pack = 200
where material_name = 'Aslan SL 109 Lamination Film';

-- Arrow Inc's 3 papers + Visual Magnetics -- unchanged in effect, but
-- renamed from the old 'simple' unit_type meaning to the new explicit
-- 'manual' consumption_basis for clarity.
update public.material_supplier_items
set consumption_basis = 'manual'
where material_name in (
  'Epson Proofing Paper S042150', 'Window Bond Film', 'Pearl Proof Super V GRACoL',
  'VM PolyMatt Magnetic Vinyl'
);

-- Verification -- expect 16 rows, consumption_basis set per the mapping above
-- (Recycled Rhine / MT 3180 / Transjet Industrial 100 stay on the default
-- 'total_required_material').
select material_name, unit_type, consumption_basis, pieces_per_pack
from public.material_supplier_items
order by material_name;
