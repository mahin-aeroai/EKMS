-- MMDI ONE — Installation Report: corrected per-site import (round 2)
-- Run this in the Supabase SQL Editor, after
-- supabase-installation-report-store-sites-table-migration.sql. This
-- supersedes supabase-installation-report-store-sites-import.sql — it
-- carries the operator-reviewed Fixture Type + Sign Type (and a handful of
-- Material/Store Name/SFO ID corrections found along the way) from
-- Installation_Report_Site_Details_Fill_Me.xlsx. Safe to run even if
-- round 1 was never run — this covers all fields for every row itself.
--
-- STEP 1 fixes 3 SFO ID mix-ups the review caught in Store Master itself
-- (a store's SFO ID must be correct before its sites can be matched to it):
--   - iCorner - Shivamogga was wrongly sharing an SFO ID with
--     "iPlanet - Providence Mall - Puducherry" — Shivamogga's ID is
--     corrected to 1533313, freeing 1657381 for Providence Mall (inserted
--     as a new store, since it never made it into Store Master before).
--   - "iMagine @ Vidhya Nagar, Jaipur" is renamed to "iMagine @ Vidyadhar
--     Nagar" (same SFO ID 4094043, no change needed there) and
--     "iPlanet @ Vidyaranyapura" — the other store that had been sharing
--     that SFO ID — is inserted as a new store with its own corrected ID,
--     4151244.
--
-- ONE COLLISION IS STILL UNRESOLVED AND NOT INCLUDED HERE — see the
-- message after this file for "UNICORN@ RAEBARELI" / "iMagine @
-- Hanumangarh": the corrected sheet gives Raebareli a new SFO ID
-- (4033662) that's already used by a different existing store
-- ("UNICORN @ AYODHYA, RIKABGANJ, AYODHYA"), so that move — and
-- Hanumangarh's site, which needs Raebareli's old ID (4261142) freed up
-- first — are both skipped until we have the right SFO ID for Raebareli.
-- Raebareli's own site details (fixture/sign/material/size) ARE included
-- below, under its current, unchanged SFO ID.
--
-- Safe to re-run — every step is idempotent (ON CONFLICT / upsert).

-- ============================================================
-- STEP 1 — Store Master corrections
-- ============================================================

update public.installation_report_stores
  set sfo_id = '1533313'
  where sfo_id = '1657381' and store_name = 'iCorner - Shivamogga';

update public.installation_report_stores
  set store_name = 'iMagine @ Vidyadhar Nagar'
  where sfo_id = '4094043';

insert into public.installation_report_stores (store_name, address, sfo_id, program, active)
values
  ('iPlanet - Providence Mall - Puducherry', 'Mr. Gagan- 9789191678, Shop No.21, Providence Mall, No.7, Venkata Subba Reddiar Roundabout, Salai, Puducherry 605001', '1657381', 'Mono AAR', true),
  ('iPlanet @ Vidyaranyapura', 'iPlanet - Vidyaranyapura - Ground Floor, #600 Narasipura, HMT Employees Co-op Hsg. So. Ltd., Vidyaranyapura Main Road, Vidyaranyapura, Bengaluru- 560 097 | Prasath - +91 99524 86391', '4151244', 'Mono AAR', true)
on conflict (sfo_id) where sfo_id is not null and sfo_id <> '' do nothing;

-- ============================================================
-- STEP 2 — per-site Fixture Type / Material / Sign Type / Size
-- (183 of 184 reviewed rows — see note above on the 1 skipped row)
-- ============================================================

insert into public.installation_report_store_sites (store_id, site_index, fixture_type, material, sign_type, width_mm, height_mm)
select s.id, v.site_index, v.fixture_type, v.material, v.sign_type, v.width_mm, v.height_mm
from (values
  ('1696992', 1, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 5466, 2340),
  ('3901876', 1, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Backlit Fabric', 4310, 3750),
  ('1784220', 1, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 4860, 2700),
  ('4044737', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 7410, 2150),
  ('1606231', 1, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 6315, 2030),
  ('1606231', 2, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 6255, 2000),
  ('3677889', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 5700, 2600),
  ('4038163', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 5320, 2060),
  ('4106601', 1, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Backlit Fabric', 4205, 2843),
  ('1696991', 1, 'PVC Backlit Sign', 'Endutex Banner - Back Lit', 'PVC Backlit Banner', 930, 1530),
  ('1696991', 2, 'PVC Backlit Sign', 'Endutex Banner - Back Lit', 'PVC Backlit Banner', 930, 1530),
  ('544958', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 3000, 1100),
  ('544958', 2, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 3000, 1100),
  ('1710313', 1, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 5830, 2230),
  ('984562', 1, 'PVC Non-lit Sign', 'Endutex Banner - Frontlit - BWX500', 'PVC Non-lit Banner', 2970, 2435),
  ('2010319', 1, 'PVC Backlit Sign', 'Endutex Banner - Back Lit', 'PVC Backlit Banner', 13716, 4572),
  ('3677885', 1, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 5570, 3640),
  ('727945', 1, 'PVC Backlit Sign', 'Endutex Banner - Back Lit', 'PVC Backlit Banner', 1499, 2185),
  ('3480701', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 1375, 2278),
  ('3480701', 2, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 1310, 2278),
  ('1533301', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 5190, 1245),
  ('3638797', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 2455, 2495),
  ('1735046', 1, 'PVC Backlit Sign', 'Endutex Banner - Back Lit', 'PVC Backlit Banner', 3675, 1840),
  ('3781908', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 10030, 998),
  ('3781908', 2, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 1803, 2326),
  ('4057046', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 2490, 2032),
  ('4057046', 2, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 2413, 1702),
  ('435047', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 4483, 2578),
  ('1346259', 1, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 5828, 2896),
  ('1346259', 2, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 1880, 2972),
  ('1341397', 1, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 2450, 2000),
  ('1588150', 1, 'PVC Backlit Sign', 'Endutex Banner - Back Lit', 'PVC Backlit Banner', 9220, 1160),
  ('1589432', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 2165, 2510),
  ('1639359', 1, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 3640, 2965),
  ('1341386', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 6428, 2695),
  ('4041811', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 5334, 2133),
  ('4006989', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 2345, 2640),
  ('3579615', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 2997, 1095),
  ('3746352', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 6110, 2250),
  ('3546076', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 3525, 3150),
  ('4034663', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 3865, 2485),
  ('3844809', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 5406, 2950),
  ('3471943', 1, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 10000, 2295),
  ('3966944', 1, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Backlit Fabric', 6162, 2961),
  ('3598599', 1, 'PVC Backlit Sign', 'Endutex Banner - Back Lit', 'PVC Backlit Banner', 3290, 2427),
  ('3458714', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 7890, 2176),
  ('1635603', 1, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 2170, 2170),
  ('4151858', 1, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Backlit Fabric', 5315, 1880),
  ('1551107', 1, 'PVC Non-lit Sign', 'Endutex Banner - Frontlit - BWX500', 'PVC Non-lit Banner', 11300, 2400),
  ('2150126', 1, 'Window Decal', '3M IJ 8150 clear + Avery SC 900-152-S Blockout', 'Window Graphic', 11420, 2230),
  ('1603819', 1, 'Window Decal', '3M IJ 8150 clear + Avery SC 900-152-S Blockout', 'Window Graphic', 7571, 2130),
  ('2150127', 1, 'Window Decal', '3M IJ 8150 clear + Avery SC 900-152-S Blockout', 'Window Graphic', 7750, 2238),
  ('1676390', 1, 'PVC Non-lit Sign', 'Endutex Banner - Frontlit - BWX500', 'PVC Non-lit Banner', 4978, 3581),
  ('1635608', 1, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 1215, 2140),
  ('1721272', 1, 'PVC Non-lit Sign', 'Endutex Banner - Frontlit - BWX500', 'PVC Non-lit Banner', 3985, 2610),
  ('1721270', 1, 'PVC Non-lit Sign', 'Endutex Banner - Frontlit - BWX500', 'PVC Non-lit Banner', 5145, 2708),
  ('3677890', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 4295, 3565),
  ('4033645', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 2489, 2320),
  ('4243772', 1, 'PVC Non-lit Sign', 'Endutex Banner - Frontlit - BWX500', 'PVC Non-lit Banner', 4500, 9850),
  ('4049085', 1, 'PVC Non-lit Sign', 'Endutex Banner - Frontlit - BWX500', 'PVC Non-lit Banner', 7239, 3048),
  ('4049086', 1, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Backlit Fabric', 2875, 2440),
  ('4033662', 1, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Backlit Fabric', 5085, 1485),
  ('818674', 1, 'PVC Non-lit Sign', 'Endutex Banner - Frontlit - BWX500', 'PVC Non-lit Banner', 8840, 3430),
  ('818674', 2, 'PVC Non-lit Sign', 'Endutex Banner - Frontlit - BWX500', 'PVC Non-lit Banner', 3645, 3410),
  ('4261142', 1, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 4529, 2405),
  ('1616817', 1, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 4235, 1930),
  ('1528172', 1, 'PVC Backlit Sign', 'Endutex Banner - Back Lit', 'PVC Backlit Banner', 3640, 2125),
  ('3947316', 1, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Fabric Backlit', 4100, 3200),
  ('3203628', 1, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Backlit Fabric', 3352, 8075),
  ('3733985', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 1630, 3416),
  ('4147785', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 4120, 2500),
  ('4145424', 1, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Backlit Fabric', 12015, 2015),
  ('389086', 1, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Backlit Fabric', 5486, 3657),
  ('3561342', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 5133, 1895),
  ('4227983', 1, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Backlit Fabric', 3547, 2226),
  ('4203387', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 2090, 2800),
  ('3759017', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 3153, 2150),
  ('1345252', 1, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 4625, 2185),
  ('3966940', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 2946, 3045),
  ('3981506', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 2898, 2287),
  ('3033485', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 5354, 2956),
  ('3033485', 2, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 2058, 2921),
  ('1600026', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 3780, 2860),
  ('1565576', 1, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 6220, 3020),
  ('1697008', 1, 'PVC Non-lit Sign', 'Endutex Banner - Frontlit - BWX500', 'PVC Non-lit Banner', 4851, 2514),
  ('1710356', 1, 'Window Decal', '3M IJ 8150 clear + Avery SC 900-152-S Blockout', 'Window Graphic', 860, 3390),
  ('1710356', 2, 'Window Decal', '3M IJ 8150 clear + Avery SC 900-152-S Blockout', 'Window Graphic', 860, 475),
  ('3730068', 1, 'PVC Non-lit Sign', 'Endutex Banner - Frontlit - BWX500', 'PVC Non-lit Banner', 5610, 6005),
  ('1533313', 1, 'PVC Non-lit Sign', 'Endutex Banner - Frontlit - BWX500', 'PVC Non-lit Banner', 7334, 1880),
  ('1533313', 2, 'PVC Non-lit Sign', 'Endutex Banner - Frontlit - BWX500', 'PVC Non-lit Banner', 6150, 1890),
  ('3103405', 1, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 2590, 2580),
  ('1697001', 1, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 2630, 2420),
  ('1533290', 1, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 3055, 2460),
  ('2370346', 1, 'Window Decal', '3M IJ 8150 clear + Avery SC 900-152-S Blockout', 'Window Graphic', 2230, 3375),
  ('3385941', 1, 'PVC Non-lit Sign', 'Endutex Banner - Frontlit - BWX500', 'PVC Non-lit Banner', 6555, 3510),
  ('4064148', 1, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Backlit Fabric', 1280, 2515),
  ('4064148', 2, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Backlit Fabric', 1285, 2515),
  ('3970650', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 2780, 1660),
  ('4094042', 1, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Backlit Fabric', 4512, 2251),
  ('4094042', 2, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Backlit Fabric', 1425, 1510),
  ('4036335', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 8936, 2466),
  ('4001405', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 4080, 2470),
  ('3477115', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 2510, 2630),
  ('3477115', 2, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 1890, 2890),
  ('4057048', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 4180, 2950),
  ('4057048', 2, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 2870, 3530),
  ('3970649', 1, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Fabric Backlit', 7570, 3180),
  ('3970649', 2, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 6705, 1815),
  ('4034662', 1, 'PVC Non-lit Sign', 'Endutex Banner - Frontlit - BWX500', 'PVC Non-lit Banner', 5792, 2515),
  ('4001404', 1, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Fabric Backlit', 3966, 2205),
  ('4001404', 2, 'Outdoor Non-lit Sign', 'Soyang216T Non-lit Fabric + Eyelets', 'Fabric Non-lit', 7680, 4120),
  ('4001404', 3, 'Outdoor Non-lit Sign', 'Soyang216T Non-lit Fabric + Eyelets', 'Fabric Non-lit', 7675, 4120),
  ('3952297', 1, 'PVC Non-lit Sign', 'Endutex Banner - Frontlit - BWX500', 'PVC Non-lit Banner', 2032, 5995),
  ('3672236', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 7350, 2595),
  ('4034664', 1, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Fabric Backlit', 3460, 3770),
  ('1710849', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 6500, 1070),
  ('4094043', 1, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Backlit Fabric', 5795, 2525),
  ('820439', 1, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 5765, 3506),
  ('820439', 2, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 5765, 3506),
  ('1997364', 1, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 6600, 2500),
  ('1635602', 1, 'PVC Non-lit Sign', 'Endutex Banner - Frontlit - BWX500', 'PVC Non-lit Banner', 4525, 3655),
  ('2067885', 1, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Backlit Fabric', 3364, 1830),
  ('3334451', 1, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 5560, 2215),
  ('3966945', 1, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Backlit Fabric', 1795, 2675),
  ('4014182', 1, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Backlit Fabric', 6862, 2875),
  ('4014182', 2, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Backlit Fabric', 3150, 2275),
  ('4341261', 1, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Backlit Fabric', 7182, 2290),
  ('4332656', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 7242, 2382),
  ('3419538', 1, 'Window Decal', 'One Way Vision', 'PVC One Way Vision', 2165, 1815),
  ('3966947', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 5560, 2890),
  ('4151243', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 3605, 2550),
  ('1341385', 1, 'PVC Non-lit Sign', 'Endutex Banner - Frontlit - BWX500', 'PVC Non-lit Banner', 7925, 3048),
  ('1300789', 1, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 4760, 2600),
  ('1110206', 1, 'PVC Backlit Sign', 'Endutex Banner - Back Lit', 'PVC Backlit Banner', 2743, 2388),
  ('4041814', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 5182, 2617),
  ('3035986', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 6385, 2670),
  ('4227980', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 7430, 2261),
  ('3637782', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 7280, 2300),
  ('3637782', 2, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 2340, 2845),
  ('3994349', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 7100, 2870),
  ('4227978', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 2350, 1650),
  ('4227979', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 7140, 2740),
  ('4357051', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 6578, 1892),
  ('1531166', 1, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 2769, 2769),
  ('4206435', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 7455, 1982),
  ('4138055', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 7365, 1968),
  ('1635604', 1, 'PVC Backlit Sign', 'Endutex Banner - Back Lit', 'PVC Backlit Banner', 2998, 3040),
  ('4227977', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 5157, 2464),
  ('1341387', 1, 'PVC Non-lit Sign', 'Endutex Banner - Frontlit - BWX500', 'PVC Non-lit Banner', 4650, 3000),
  ('4227976', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 4725, 2744),
  ('4041810', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 5487, 2896),
  ('4007522', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 6350, 1803),
  ('4206346', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 4216, 1930),
  ('3579614', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 6928, 2971),
  ('3219448', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 7146, 3440),
  ('1697010', 1, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 3795, 2330),
  ('1697010', 2, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 4525, 2330),
  ('3604316', 1, 'PVC Backlit Sign', 'Endutex Banner - Back Lit', 'PVC Backlit Banner', 9750, 3040),
  ('1656917', 1, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 2730, 2530),
  ('1710842', 1, 'PVC Non-lit Sign', 'Endutex Banner - Frontlit - BWX500', 'PVC Non-lit Banner', 12200, 3050),
  ('4013982', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 3050, 2338),
  ('4013982', 2, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 3050, 2338),
  ('4013982', 3, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 3005, 2338),
  ('1710843', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 5385, 2860),
  ('4006988', 1, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Backlit Fabric', 6042, 2565),
  ('3720508', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 8846, 1372),
  ('3593480', 1, 'PVC Backlit Sign', 'Endutex Banner - Back Lit', 'PVC Backlit Banner', 3860, 3378),
  ('3565782', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 4092, 1957),
  ('4006990', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 1840, 2735),
  ('3766657', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 1930, 2070),
  ('4081607', 1, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Backlit Fabric', 5750, 3740),
  ('1565561', 1, 'Window Decal', '3M IJ 8150 clear + Avery SC 900-152-S Blockout', 'Window Graphic', 4485, 2400),
  ('1565561', 2, 'Window Decal', '3M IJ 8150 clear + Avery SC 900-152-S Blockout', 'Window Graphic', 3000, 2400),
  ('1661448', 1, 'PVC Non-lit Sign', 'Endutex Banner - Frontlit - BWX500', 'PVC Non-lit Banner', 5665, 3785),
  ('3471560', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 3065, 2200),
  ('825652', 1, 'PVC Non-lit Sign', 'Endutex Banner - Frontlit - BWX500', 'PVC Non-lit Banner', 4737, 3493),
  ('4064149', 1, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Backlit Fabric', 2858, 2934),
  ('3973670', 1, 'Outdoor Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric + Eyelets', 'Backlit Fabric', 5563, 3023),
  ('3608643', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 5325, 2940),
  ('3608643', 2, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 2440, 2765),
  ('3608643', 3, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 2410, 2765),
  ('1657381', 1, 'Window Decal', '3M IJ 48C + 3M 8050 Matt Lam', 'Window Graphic', 5110, 2960),
  ('4151244', 1, 'SEG Backlit Fabric Sign', 'Soyang 601 UT Backlit Fabric', 'Backlit Fabric', 4140, 2055)
) as v(sfo_id, site_index, fixture_type, material, sign_type, width_mm, height_mm)
join public.installation_report_stores s on s.sfo_id = v.sfo_id
on conflict (store_id, site_index) do update set
  fixture_type = excluded.fixture_type,
  material = excluded.material,
  sign_type = excluded.sign_type,
  width_mm = excluded.width_mm,
  height_mm = excluded.height_mm;

-- ============================================================
-- Verification
-- ============================================================

-- select count(*) from public.installation_report_store_sites where fixture_type is not null;  -- expect 183
-- select st.store_name, ss.site_index, ss.fixture_type, ss.sign_type, ss.width_mm, ss.height_mm
--   from public.installation_report_store_sites ss
--   join public.installation_report_stores st on st.id = ss.store_id
--   order by st.store_name, ss.site_index;
