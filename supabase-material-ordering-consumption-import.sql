-- MMDI ONE -- Material Ordering: refresh material_consumption_rows from
-- the updated "Import Material Purchases.xlsx" (Sheet1, 80 rows after
-- dropping 2 exact duplicate pairs the sheet had for Endutex BWX 500 and
-- Endutex Back EX Banner -- rows 70/72 and 71/73 were byte-for-byte
-- identical).
--
-- What changed since the first import (see git history for that version):
--   - `program` is now filled in for every row that previously imported
--     null (the Multi AAR GPX / LFG / Easels / Proofing / PIM Graphics
--     rows) -- this supersedes supabase-material-ordering-consumption-
--     rows-fill-programs-migration.sql, which is now a no-op if run again.
--   - `qty_per_pack` is new (see supabase-material-ordering-qty-per-pack-
--     migration.sql, which must run before this file) -- filled in for 8
--     rows (the 4 Partner Pay GPS / Primex Styrene rows and the 4 Multi AAR
--     GPX rows), null everywhere else.
--   - 4 new rows: 2 duplicate Endutex pairs (deduped away, see above), plus
--     2 genuinely new materials with no supplier on file yet -- "Lexjet PP
--     Film" / "LexjetToughCoat PP Film" (PIM Graphics program) and "Soyang
--     601 UT" / "Soynag 601 UT Backlit Fabric" (LFG program, note the
--     sheet's own spelling "Soynag"). Both import fine as consumption data
--     but won't appear in the Order Builder until a material_supplier_items
--     row exists for them -- add their supplier/pack size once known.
--
-- TRUNCATE + fresh insert rather than a row-by-row diff/upsert:
-- material_consumption_rows has no stable natural key across re-exports of
-- the sheet (SKU ID is blank on most of the reference rows, and this
-- update's duplicate rows show the sheet itself isn't guaranteed unique),
-- and no other table references these rows by id (material_orders.lines is
-- a frozen jsonb snapshot, not a foreign key -- see schema header), so
-- wiping and reimporting is both simpler and safer than trying to match
-- old rows to new ones.
--
-- Raw Material 2 normalization unchanged from the first import: every
-- "Transjet Industrial <n>" collapses to "Transjet Industrial 100" (still
-- a single material, still just an Excel autofill artifact -- the refreshed
-- sheet didn't introduce any new Transjet numbers).

truncate table public.material_consumption_rows;

insert into public.material_consumption_rows (
  product_name, sku_id, category, sku_description, bill_rate, program,
  material_1, material_2, material_3, sku, width_mm, height_mm, sqm,
  order_qty, print_length_mm, material_width_mm, linear_metres,
  total_required_material, qty_per_pack
) values
  ('MT3180', '829-0000009', 'Channel - APR GPF', 'GPF21-APR 2.0', 29510.0, 'APR 2.0', 'MT 3180', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF21', 3000.0, 2000.0, 6.0, 15.0, 3000.0, 2600.0, 45.0, 63.0, null),
  ('MT3180', '829-0000010', 'Channel - APR GPF', 'GPF22-APR 2.0', 10820.0, 'APR 2.0', 'MT 3180', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF22', 2000.0, 1100.0, 2.2, null, 2000.0, 1400.0, 0.0, 0.0, null),
  ('MT3180', '829-0000011', 'Channel - APR GPF', 'GPF23-APR 2.0', 16230.0, 'APR 2.0', 'MT 3180', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF23', 3000.0, 1100.0, 3.3, 11.0, 3000.0, 1400.0, 33.0, 46.2, null),
  ('MT3180', '829-0000012', 'Channel - APR GPF', 'GPF24-APR 2.0', 23804.0, 'APR 2.0', 'MT 3180', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF24', 4400.0, 1100.0, 4.84, 47.0, 4400.0, 1400.0, 206.8, 289.52000000000004, null),
  ('RM-18017 Recycled Rhine', '829-0000013', 'Channel - Apple Shop GPF', 'GPF2-AS2', 26506.0, 'AS2', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF2', 3000.0, 1285.0, 3.86, null, 3000.0, 1400.0, 0.0, 0.0, null),
  ('RM-18017 Recycled Rhine', '829-0000014', 'Channel - APR 2.5 GPF', 'GPF21-APR 2.5', 41254.0, 'APR 2.5', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF21', 3000.0, 2000.0, 6.0, 47.0, 3000.0, 2600.0, 141.0, 197.4, null),
  ('RM-18017 Recycled Rhine', '829-0000015', 'Channel - APR 2.5 GPF', 'GPF22-APR 2.5', 15126.0, 'APR 2.5', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF22', 2000.0, 1100.0, 2.2, 50.0, 2000.0, 1400.0, 100.0, 140.0, null),
  ('RM-18017 Recycled Rhine', '829-0000016', 'Channel - APR 2.5 GPF', 'GPF23-APR 2.5', 22690.0, 'APR 2.5', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF23', 3000.0, 1100.0, 3.3, 81.0, 3000.0, 1400.0, 243.0, 340.2, null),
  ('RM-18017 Recycled Rhine', '829-0000017', 'Channel - APR 2.5 GPF', 'GPF24-APR 2.5', 33278.0, 'APR 2.5', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF24', 4400.0, 1100.0, 4.84, 204.0, 4400.0, 1400.0, 897.6, 1256.64, null),
  ('RM-18017 Recycled Rhine', '829-0000018', 'Channel - APR 2.5 GPF', 'GPF25-APR 2.5', 6875.0, 'APR 2.5', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF25', 841.0, 1189.0, 1.0, 231.0, 841.0, 2600.0, 97.1355, 135.9897, null),
  ('RM-18017 Recycled Rhine', '829-0000019', 'Channel - APR 2.5 GPF', 'GPF26-APR 2.5', 13751.0, 'APR 2.5', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF26', 1682.0, 1189.0, 2.0, 92.0, 1189.0, 2600.0, 54.694, 76.5716, null),
  ('RM-18017 Recycled Rhine', '829-0000020', 'Channel - APR 2.5 GPF', 'GPF31-APR 2.5', 6912.0, 'APR 2.5', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF31', 930.0, 1081.0, 1.01, 63.0, 1081.0, 2600.0, 34.0515, 47.6721, null),
  ('RM-18017 Recycled Rhine', '829-0000021', 'Channel - APR 2.5 GPF', 'GPF32-APR 2.5', 14345.0, 'APR 2.5', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF32', 1930.0, 1081.0, 2.09, 13.0, 1081.0, 2600.0, 7.0264999999999995, 9.8371, null),
  ('RM-18017 Recycled Rhine', '829-0000022', 'Channel - APR 2.5 GPF', 'GPF33-APR 2.5', 13751.0, 'APR 2.5', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF33', 1189.0, 1682.0, 2.0, 6.0, 1682.0, 1400.0, 10.091999999999999, 14.128799999999998, null),
  ('RM-18017 Recycled Rhine', '829-0000023', 'Channel - Mobility GPF', 'GPF5-MOBILITY', 10602.0, 'MOB', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF5', 1200.0, 1285.0, 1.54, null, 1285.0, 1400.0, 0.0, 0.0, null),
  ('RM-18017 Recycled Rhine', '829-0000024', 'Channel - White Plus - GPF', 'GPF15-White Plus', 8876.0, 'White', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF15', 1000.0, 1291.0, 1.29, 4.0, 1291.0, 1400.0, 5.164, 7.2296, null),
  ('RM-18017 Recycled Rhine', '829-0000025', 'Channel - White Plus - GPF', 'GPF16-White Plus', 10652.0, 'White', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF16', 1200.0, 1291.0, 1.55, 64.0, 1291.0, 1400.0, 82.624, 115.6736, null),
  ('RM-18017 Recycled Rhine', '829-0000026', 'Channel - White Plus - GPF', 'GPF17-White Plus', 5782.0, 'White', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF17', 1000.0, 841.0, 0.84, 4.0, 841.0, 1400.0, 3.364, 4.7096, null),
  ('RM-18017 Recycled Rhine', '829-0000027', 'Channel - White Plus - GPF', 'GPF18-White Plus', 6939.0, 'White', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF18', 1200.0, 841.0, 1.01, 71.0, 841.0, 1400.0, 59.711, 83.5954, null),
  ('RM-18017 Recycled Rhine', '829-0000028', 'Channel - APP GPF', 'GPF62-APP', 7013.64, 'APP', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF62', 841.0, 1189.0, 1.0, 98.0, 841.0, 1400.0, 82.41799999999999, 115.3852, null),
  ('RM-18017 Recycled Rhine', '829-0000029', 'Channel - APP GPF', 'GPF63-APP', 14027.28, 'APP', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF63', 1189.0, 1682.0, 2.0, 2.0, 1682.0, 1400.0, 3.364, 4.7096, null),
  ('RM-18017 Recycled Rhine', '829-0000030', 'Channel - APP GPF', 'GPF64-APP', 14027.28, 'APP', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF64', 1682.0, 1189.0, 2.0, 37.0, 1682.0, 1400.0, 62.233999999999995, 87.1276, null),
  ('RM-18017 Recycled Rhine', '829-0000031', 'Channel - APP GPF', 'GPF67-APP', 39801.5, 'APP', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF67', 3020.0, 1879.0, 5.67, 8.0, 3020.0, 2600.0, 24.16, 33.824, null),
  ('RM-18017 Recycled Rhine', '829-0000032', 'Channel - APP GPF', 'GPF68-APP', 32027.61, 'APP', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF68', 3020.0, 1512.0, 4.57, 7.0, 3020.0, 1600.0, 21.14, 29.596000000000004, null),
  ('RM-18017 Recycled Rhine', '829-0000033', 'Channel - APP GPF', 'GPF69-APP', 59702.26, 'APP', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF69', 4530.0, 1879.0, 8.51, 15.0, 4530.0, 2600.0, 67.95, 95.13000000000001, null),
  ('RM-18017 Recycled Rhine', '829-0000034', 'Channel - APP GPF', 'GPF70-APP', 48041.41, 'APP', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF70', 4530.0, 1512.0, 6.85, 18.0, 4530.0, 1600.0, 81.54, 114.156, null),
  ('RM-18017 Recycled Rhine', '829-0000035', 'Channel - APP GPF', 'GPF71-APP', 32027.61, 'APP', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF71', 3020.0, 1512.0, 4.57, 8.0, 3020.0, 1600.0, 24.16, 33.824, null),
  ('RM-18017 Recycled Rhine', '829-0000036', 'Channel - APP GPF', 'GPF72-APP', 48041.41, 'APP', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF72', 4530.0, 1512.0, 6.85, 6.0, 4530.0, 1600.0, 27.18, 38.052, null),
  ('RM-18017 Recycled Rhine', '829-0000037', 'Channel - APP GPF', 'GPF73-APP', 24825.63, 'APP', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF73', 1510.0, 2344.0, 3.54, null, 2344.0, 1600.0, 0.0, 0.0, null),
  ('RM-18017 Recycled Rhine', '829-0000038', 'Channel - APP GPF', 'GPF81-APP', 9244.55, 'APP', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF81', 1294.0, 1039.0, 1.34, 73.0, 1294.0, 1400.0, 94.462, 132.2468, null),
  ('RM-18017 Recycled Rhine', '829-0000039', 'Channel - Apple Shop GPF', 'GPF47-AS3', 9689.43, 'AS3', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF47', 1294.0, 1089.0, 1.41, null, 1294.0, 1400.0, 0.0, 0.0, null),
  ('RM-18017 Recycled Rhine', '829-0000040', 'Channel - Apple Shop GPF', 'GPF49-AS3', 16144.1, 'AS3', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF49', 1184.0, 1944.0, 2.3, null, 1944.0, 1400.0, 0.0, 0.0, null),
  ('RM-18017 Recycled Rhine', '829-0000041', 'Channel - Apple Shop GPF', 'GPF55-AS3', 30089.98, 'AS3', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF55', 2729.0, 1572.0, 4.29, null, 2729.0, 1600.0, 0.0, 0.0, null),
  ('RM-18017 Recycled Rhine', '829-0000042', 'Channel - Apple Shop GPF', 'GPF71-AS3', 32027.61, 'AS3', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF71', 3020.0, 1512.0, 4.57, 3.0, 3020.0, 1600.0, 9.06, 12.684000000000001, null),
  ('RM-18017 Recycled Rhine', '829-0000043', 'Channel - Apple Shop GPF', 'GPF72-AS3', 48041.41, 'AS3', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF72', 4530.0, 1512.0, 6.85, null, 4530.0, 1600.0, 0.0, 0.0, null),
  ('RM-18017 Recycled Rhine', '829-0000044', 'Channel - Apple Shop GPF', 'GPF73-AS3', 24825.63, 'AS3', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF73', 1510.0, 2344.0, 3.54, null, 2344.0, 1600.0, 0.0, 0.0, null),
  ('RM-18017 Recycled Rhine', '829-0000045', 'Channel - Apple Shop GPF', 'GPF76-AS3', 31815.5, 'AS3', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF76', 3000.0, 1512.0, 4.54, null, 3000.0, 1600.0, 0.0, 0.0, null),
  ('RM-18017 Recycled Rhine', '829-0000046', 'Channel - Apple Shop GPF', 'GPF77-AS3', 51509.3, 'AS3', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF77', 4857.0, 1512.0, 7.34, null, 4857.0, 1600.0, 0.0, 0.0, null),
  ('RM-18017 Recycled Rhine', '829-0000047', 'Channel - Apple Shop GPF', 'GPF80-AS3', 18360.5, 'AS3', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF80', 2570.0, 1039.0, 2.67, null, 2570.0, 1400.0, 0.0, 0.0, null),
  ('RM-18017 Recycled Rhine', '829-0000048', 'Channel - Apple Shop GPF', 'GPF81-AS3', 9244.55, 'AS3', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF81', 1294.0, 1039.0, 1.34, 10.0, 1294.0, 1400.0, 12.940000000000001, 18.116000000000003, null),
  ('RM-18017 Recycled Rhine', '829-0000049', 'Channel - Apple Shop GPF', 'GPF82-AS3', 64055.21, 'AS3', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF82', 6040.0, 1512.0, 9.13, null, 6040.0, 1600.0, 0.0, 0.0, null),
  ('RM-18017 Recycled Rhine', '829-0000050', 'Channel - Apple Shop GPF', 'GPF83-AS3', 31064.78, 'AS3', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF83', 2988.0, 1512.0, 4.52, 3.0, 2988.0, 1600.0, 8.964, 12.549600000000002, null),
  ('RM-18017 Recycled Rhine', '829-0000051', 'Channel - Apple Shop GPF', 'GPF84-AS3', 25632.69, 'AS3', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF84', 2417.0, 1512.0, 3.65, 2.0, 2417.0, 1600.0, 4.834, 6.7676, null),
  ('RM-18017 Recycled Rhine', '829-0000052', 'Channel - Apple Shop GPF', 'GPF85-AS3', 25632.69, 'AS3', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF85', 2417.0, 1512.0, 3.65, 2.0, 2417.0, 1600.0, 4.834, 6.7676, null),
  ('RM-18017 Recycled Rhine', '829-0000053', 'Channel - Apple Shop GPF', 'GPF86-AS3', 40775.12, 'AS3', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF86', 3922.0, 1512.0, 5.93, null, 3922.0, 1600.0, 0.0, 0.0, null),
  ('RM-18017 Recycled Rhine', '829-0000054', 'Channel - Apple Shop GPF', 'GPF87-AS3', 28941.5, 'AS3', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF87', 2729.0, 1512.0, 4.13, 2.0, 2729.0, 1600.0, 5.458, 7.6412, null),
  ('RM-18017 Recycled Rhine', '829-0000055', 'Channel - Apple Shop GPF', 'GPF88-AS3', 28941.5, 'AS3', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF88', 2729.0, 1512.0, 4.13, 2.0, 2729.0, 1600.0, 5.458, 7.6412, null),
  ('RM-18017 Recycled Rhine', '829-0000056', 'Channel - Apple Shop GPF', 'GPF89-AS4', 46763.51, 'AS3', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF89', 4498.0, 1512.0, 6.8, null, 4498.0, 1600.0, 0.0, 0.0, null),
  ('RM-18017 Recycled Rhine', '829-0000057', 'Channel - Apple Shop GPF', 'GPF90-AS4', 31995.79, 'AS3', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF90', 3017.0, 1512.0, 4.56, null, 3017.0, 1600.0, 0.0, 0.0, null),
  ('RM-18017 Recycled Rhine', '829-0000058', 'Channel - Apple Shop GPF', 'GPF91-AS4', 31995.79, 'AS3', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF91', 3017.0, 1512.0, 4.56, null, 3017.0, 1600.0, 0.0, 0.0, null),
  ('RM-18017 Recycled Rhine', '829-0000059', 'Channel - Apple Shop GPF', 'GPF92-AS4', 48009.6, 'AS3', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF92', 4527.0, 1512.0, 6.84, null, 4527.0, 1600.0, 0.0, 0.0, null),
  ('RM-18017 Recycled Rhine', '829-0000060', 'Channel - Apple Shop GPF', 'GPF93-AS4', 48009.6, 'AS3', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF93', 4527.0, 1512.0, 6.84, null, 4527.0, 1600.0, 0.0, 0.0, null),
  ('RM-18017 Recycled Rhine', '829-0000061', 'Channel - Apple Shop GPF', 'GPF94-AS4', 8346.66, 'AS3', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF94', 1725.0, 690.0, 1.19, 4.0, 690.0, 1600.0, 2.76, 3.864, null),
  ('RM-18017 Recycled Rhine', '829-0000062', 'Channel - Apple Shop GPF', 'GPF95-AS4', 17324.58, 'AS3', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF95', 3446.0, 718.0, 2.47, 16.0, 3446.0, 1600.0, 55.136, 77.19040000000001, null),
  ('RM-18017 Recycled Rhine', '829-0000063', 'Channel - Apple Shop GPF', 'GPF96-AS4', 9118.2, 'AS3', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF96', 1111.0, 1169.5, 1.3, 8.0, 1111.0, 1600.0, 8.888, 12.443200000000001, null),
  ('RM-18017 Recycled Rhine', '829-0000064', 'Channel - APP Core GPF', 'GPF98', 6102.18, 'APP Core', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF98', 1044.0, 838.0, 0.87, null, 838.0, 1400.0, 0.0, 0.0, null),
  ('RM-18017 Recycled Rhine', '829-0000065', 'Channel - APP Core GPF', 'GPF99', 9398.76, 'APP Core', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF99', 1831.0, 732.0, 1.34, null, 1831.0, 1400.0, 0.0, 0.0, null),
  ('RM-18017 Recycled Rhine', '829-0000066', 'Channel - APP Core GPF', 'GPF100', 37945.74, 'APP Core', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF100', 4027.0, 1344.0, 5.41, null, 4027.0, 1600.0, 0.0, 0.0, null),
  ('RM-18017 Recycled Rhine', '829-0000067', 'Channel - APP Core GPF', 'GPF101', 30581.04, 'APP Core', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF101', 3241.0, 1344.0, 4.36, 1.0, 3241.0, 1600.0, 3.241, 4.5374, null),
  ('RM-18017 Recycled Rhine', '829-0000068', 'Channel - APP Core GPF', 'GPF102', 19989.9, 'APP Core', 'Recycled Rhine', 'Transjet Industrial 100', 'Silicon Gasket', 'GPF102', 2385.0, 1194.0, 2.85, null, 2385.0, 1400.0, 0.0, 0.0, null),
  ('Styrene', '829-0000098', null, 'GPS12', 7444.0, 'Partner Pay GPS', 'Primex - Styrene', null, null, 'GPS12', 1375.4, 1200.0, 1.65, 516.0, null, 1500.0, null, null, 1.0),
  ('Styrene', '829-0000099', null, 'GPS13', 10116.0, 'Partner Pay GPS', 'Primex - Styrene', null, null, 'GPS13', 1875.4, 1200.0, 2.25, 684.0, null, 2000.0, null, null, 1.0),
  ('Styrene', '829-0000100', null, 'GPS18', 1581.0, 'Partner Pay GPS', 'Primex - Styrene', null, null, 'GPS18', 852.0, 403.0, 0.343356, 1250.0, null, 1828.0, null, null, 6.0),
  ('Styrene', '829-0000101', null, 'GPS19', 2799.0, 'Partner Pay GPS', 'Primex - Styrene', null, null, 'GPS19', 1117.0, 503.0, 0.561851, 2300.0, null, 1828.0, null, null, 3.0),
  ('350GSM, Sappi-Magno Satin', '829-0000007', null, 'A0 Poster', 1493.0, 'A0 Poster', '350GSM, Sappi-Magno Satin', null, null, 'A0 Poster', 841.0, 1189.0, 0.999949, 3500.0, 1189.0, 900.0, null, null, null),
  ('350GSM, Sappi-Magno Satin', '829-0000008', null, 'GPX01', 1273.0, 'GPX01', '350GSM, Sappi-Magno Satin', null, null, 'GPX01', 1000.0, 841.0, 0.841, 800.0, 1000.0, 900.0, null, null, null),
  ('350GSM, Sappi-Magno Satin', '829-0000102', 'Multi AAR GPX', 'GPX01-PVC', null, 'Multi AAR GPX', '350GSM, Sappi-Magno Satin', 'SmartX', 'Rubber Magnet', 'GPX01-PVC', 1000.0, 841.0, 0.841, 8.0, null, null, null, null, 2.0),
  ('350GSM, Sappi-Magno Satin', '829-0000103', 'Multi AAR GPX', 'GPX02', null, 'Multi AAR GPX', '350GSM, Sappi-Magno Satin', 'SmartX', 'Rubber Magnet', 'GPX02', 594.0, 841.0, 0.49955399999999994, 0.0, null, null, null, null, 4.0),
  ('350GSM, Sappi-Magno Satin', '829-0000104', 'Multi AAR GPX', 'GPX03-PVC', null, 'Multi AAR GPX', '350GSM, Sappi-Magno Satin', 'SmartX', 'Rubber Magnet', 'GPX03-PVC', 420.0, 594.0, 0.24947999999999998, 0.0, null, null, null, null, 10.0),
  ('350GSM, Sappi-Magno Satin', '829-0000105', 'Multi AAR GPX', 'GPX03', null, 'Multi AAR GPX', '350GSM, Sappi-Magno Satin', 'SmartX', 'Rubber Magnet', 'GPX03', 420.0, 594.0, 0.24947999999999998, 2800.0, null, null, null, null, 10.0),
  ('Endutex BWX 500', '829-0000078', null, 'LFG - Fl Banner', null, 'LFG', 'Endutex BWX 500', null, null, 'LFG', null, null, null, 5533.0, null, 3200.0, null, null, null),
  ('Endutex Back EX Banner', '829-0000079', null, 'LFG - Bl Banner', null, 'LFG', 'Endutex Back EX Banner', null, null, 'LFG', null, null, null, 2729.0, null, 3200.0, null, null, null),
  ('Aslan DFP25 Blockout Film', null, null, 'LFG - Blockout Film', null, 'LFG', 'Aslan DFP25 Blockout Film', null, null, 'LFG', null, null, null, 16000.0, null, 1371.6, null, null, null),
  ('Aslan SL 109 Lamination Film', null, null, null, null, 'Easels', 'Aslan SL 109 Lamination Film', null, null, 'Easels', null, null, null, 200.0, null, 1370.0, null, null, null),
  ('VM PolyMatt Magnetic Vinyl', null, null, null, null, 'Easels', 'VM PolyMatt Magnetic Vinyl', null, null, 'Easels', null, null, null, 200.0, null, 1524.0, null, null, null),
  ('Epson Proofing Paper S042150', null, null, null, null, 'Proofing', 'Epson Proofing Paper S042150', null, null, 'Proofing', null, null, null, 50.0, null, 609.5999999999999, null, null, null),
  ('Lexjet PP Film', null, null, 'PIM Graphic', null, 'PIM Graphics', 'LexjetToughCoat PP Film', null, null, 'PIM Graphics', null, null, null, 1800.0, null, 1270.0, null, null, null),
  ('Window Bond Film', null, null, null, null, 'PIM Graphics', 'Window Bond Film', null, null, 'PIM Graphics', null, null, null, 1800.0, null, 1295.3999999999999, null, null, null),
  ('Pearl Proof Super V GRACoL', null, null, null, null, 'Proofing', 'Pearl Proof Super V GRACoL', null, null, 'Proofing', null, null, null, 50.0, null, 609.5999999999999, null, null, null),
  ('Soyang 601 UT', null, null, null, null, 'LFG', 'Soynag 601 UT Backlit Fabric', null, null, 'LFG', null, null, null, 13490.0, null, 3200.0, null, null, null);

-- Verification -- expect 80 rows, and 0 nulls in `program`
select count(*) as total_rows, count(*) filter (where program is null) as rows_missing_program
from public.material_consumption_rows;
