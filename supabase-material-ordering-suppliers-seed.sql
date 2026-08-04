-- MMDI ONE -- Material Ordering: seed the 12 suppliers + materials the user
-- typed out directly (address/contact left blank for now -- fill in via the
-- Suppliers & Materials tab once the feature is live; nothing here blocks on
-- that).
--
-- material_name on each item is the EXACT string used in Raw Material 1/2/3
-- in the imported consumption sheet (see supabase-material-ordering-
-- consumption-import.sql), so the Order Builder can join
-- material_consumption_rows.material_1/2/3 = material_supplier_items.material_name
-- directly with no fuzzy matching. Verified against the sheet's actual
-- distinct values, not just the user's typed names -- a few differ slightly
-- (e.g. "Styrene" in conversation vs "Primex - Styrene" in the sheet;
-- "Self Adhesive Rubber Magnet" vs "Rubber Magnet"; "DFP 25" vs "DFP25").
--
-- Transjet Industrial: the sheet has "Transjet Industrial 100" through
-- "Transjet Industrial 159" -- a near-certain Excel autofill/drag-increment
-- artifact (the user only described ONE Transjet material/pack size). Only
-- "Transjet Industrial 100" is seeded here; the consumption import migration
-- normalizes all 101-159 variants to 100 so they match this one item.
--
-- pack_options is jsonb, shape depends on unit_type:
--   roll   -- [{ "label", "width_mm", "length_m" }]  (width_mm omitted for
--             Silicon Gasket, which is ordered by length alone)
--   sheet  -- [{ "label", "width_mm", "height_mm" }]
--   simple -- informational only, same shape as roll, no calculation reads it
--
-- Two ambiguous cases, called out for the user to correct in-app if wrong:
--   * Sappi Mills / Magno Satin -- the user gave a pack size (900mm x 350GSM
--     x 684kg reel) but no explicit order method. Weight-based packing
--     doesn't fit the roll (length) or sheet (area) calculators as specced,
--     so this is seeded as 'simple' (typed-in quantity) until a GSM-based
--     calculation is wanted.
--   * Endutex -- two materials (BWX 500, Back EX Banner) were listed with
--     two pack-size lines back to back with no explicit pairing. Paired in
--     the order given: BWX 500 -> 126in x 50m, Back EX Banner -> 5000mm x 50m.
--
-- Idempotent: ON CONFLICT DO NOTHING on both tables (unique constraints
-- added in supabase-material-ordering-schema.sql: suppliers.name,
-- supplier_items (supplier_id, material_name)).

insert into public.material_suppliers (name) values
  ('Toray Textiles Europe Ltd'),
  ('Primex Plastics'),
  ('Megatexx'),
  ('Sappi Mills'),
  ('Transjet Industrial'),
  ('Roffelsen'),
  ('Magnum Magnetics'),
  ('3A Composites'),
  ('Endutex'),
  ('Aslan'),
  ('Arrow Inc'),
  ('Visual Magnetics')
on conflict (name) do nothing;

insert into public.material_supplier_items (supplier_id, material_name, unit_type, order_method, pack_options)
select s.id, x.material_name, x.unit_type, x.order_method, x.pack_options::jsonb
from (values
  ('Toray Textiles Europe Ltd', 'Recycled Rhine', 'roll', 'consumption',
    '[{"label":"1400mm x 100m","width_mm":1400,"length_m":100},
      {"label":"1600mm x 100m","width_mm":1600,"length_m":100},
      {"label":"2600mm x 100m","width_mm":2600,"length_m":100}]'),

  ('Primex Plastics', 'Primex - Styrene', 'sheet', 'consumption',
    '[{"label":"2000 x 1300mm","width_mm":2000,"height_mm":1300},
      {"label":"1500 x 1300mm","width_mm":1500,"height_mm":1300},
      {"label":"1828.8 x 1300mm","width_mm":1828.8,"height_mm":1300}]'),

  ('Megatexx', 'MT 3180', 'roll', 'consumption',
    '[{"label":"1400mm x 100m","width_mm":1400,"length_m":100},
      {"label":"2600mm x 100m","width_mm":2600,"length_m":100}]'),

  ('Sappi Mills', '350GSM, Sappi-Magno Satin', 'simple', 'simple_count',
    '[{"label":"900mm x 350GSM x 684kg reel","width_mm":900,"gsm":350,"weight_kg":684}]'),

  ('Transjet Industrial', 'Transjet Industrial 100', 'roll', 'consumption',
    '[{"label":"3200mm x 120m","width_mm":3200,"length_m":120}]'),

  ('Roffelsen', 'Silicon Gasket', 'roll', 'consumption',
    '[{"label":"200m reel","length_m":200}]'),

  ('Magnum Magnetics', 'Rubber Magnet', 'roll', 'consumption',
    '[{"label":"100ft roll","length_m":30.48}]'),

  ('3A Composites', 'SmartX', 'sheet', 'consumption',
    '[{"label":"8 x 4ft","width_mm":2438.4,"height_mm":1219.2}]'),

  ('Endutex', 'Endutex BWX 500', 'roll', 'consumption',
    '[{"label":"126in x 50m","width_mm":3200.4,"length_m":50}]'),

  ('Endutex', 'Endutex Back EX Banner', 'roll', 'consumption',
    '[{"label":"5000mm x 50m","width_mm":5000,"length_m":50}]'),

  ('Aslan', 'Aslan DFP25 Blockout Film', 'roll', 'consumption',
    '[{"label":"54in x 25m","width_mm":1371.6,"length_m":25}]'),

  ('Aslan', 'Aslan SL 109 Lamination Film', 'roll', 'consumption',
    '[{"label":"1370mm x 50m","width_mm":1370,"length_m":50}]'),

  ('Arrow Inc', 'Epson Proofing Paper S042150', 'simple', 'simple_count',
    '[{"label":"24in x 100ft","width_mm":609.6,"length_m":30.48}]'),

  ('Arrow Inc', 'Window Bond Film', 'simple', 'simple_count',
    '[{"label":"51in x 50m","width_mm":1295.4,"length_m":50}]'),

  ('Arrow Inc', 'Pearl Proof Super V GRACoL', 'simple', 'simple_count',
    '[{"label":"24in x 150ft","width_mm":609.6,"length_m":45.72}]'),

  ('Visual Magnetics', 'VM PolyMatt Magnetic Vinyl', 'simple', 'simple_count',
    '[{"label":"60in x 100ft","width_mm":1524,"length_m":30.48}]')
) as x(supplier_name, material_name, unit_type, order_method, pack_options)
join public.material_suppliers s on s.name = x.supplier_name
on conflict (supplier_id, material_name) do nothing;

-- Verification -- expect 12 suppliers, 16 items
select (select count(*) from public.material_suppliers) as suppliers,
       (select count(*) from public.material_supplier_items) as items;
