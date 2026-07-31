-- MMDI ONE — Cost Sheet: consolidate bom_templates.category into the 8
-- top-level buckets from the original "Product Categories" sheet
--
-- WHAT THIS FIXES
--
-- The Cost Sheet's FG Code dropdown was one flat alphabetical list of all
-- 33 templates -- confusing to scan. bom_templates.category already
-- existed, but it was seeded with 20 fine-grained values (e.g. "Solvent
-- Print Signage" vs "Solvent Print Signage (Fabric)" as two separate
-- categories), not the 8 broad buckets from the reference sheet the user
-- pointed back to (Solvent / UV / Latex / Dye-Sublimation / Soft Signage /
-- Flag / UV Rigid Board / Window Blinds Products). This migration
-- reassigns category to those 8 buckets so the app-code change alongside
-- it (grouped <optgroup> dropdown + grouped BOM Master list) actually
-- groups things the way the user's own reference sheet does.
--
-- Idempotent: safe to re-run. Only touches category; nothing else on
-- these rows changes.

update public.bom_templates set category = 'Solvent Printing Products' where code in
  ('SLSD-Flex', 'SLSD-Vinyl', 'SLDD-Flex', 'SLSD-Fabric', 'SLDD-Fabric');

update public.bom_templates set category = 'UV Printing Products' where code in
  ('UVSD-Flex', 'UVSD-Vinyl', 'UVDD-Flex', 'UVDD-Vinyl', 'UVDD-Fabric', 'UVSD - Paper');

update public.bom_templates set category = 'Latex Printing Products' where code in
  ('LASD-Flex', 'LASD-Vinyl', 'LADD-Flex', 'LADD-Vinyl');

update public.bom_templates set category = 'Dye-Sublimation Printing Products' where code in
  ('DYSD-Fabric', 'DYDD-Fabric', 'DYCUR-Fabric');

update public.bom_templates set category = 'Soft Signage Products' where code in
  ('ALSEGSD-Sign', 'AlSEGDD-Sign', 'ALSEGDD2S-Sign', 'ALOASDD-SIGN', 'ALSLIM-LED Sign');

update public.bom_templates set category = 'Flag Products' where code in
  ('PFL-XLFalg', 'PFL-L Flag', 'PFL-M Flag', 'DFL-K Flag', 'DFL-H Flag');

update public.bom_templates set category = 'UV Rigid Board Printing Products' where code in
  ('UVSD-R-COR Board', 'UVSD-R-FOA Board', 'UVSD-R-PP Board', 'UVSD-R-PAC Board');

update public.bom_templates set category = 'Window Blinds' where code in
  ('WINBLD-Profile');

-- Diagnostics -- run after the block above. Should return 0 rows; if any
-- come back, a code above didn't exactly match what's actually in the
-- table (e.g. trailing space) and still needs its category set by hand.
select code, category from public.bom_templates
where category not in (
  'Solvent Printing Products',
  'UV Printing Products',
  'Latex Printing Products',
  'Dye-Sublimation Printing Products',
  'Soft Signage Products',
  'Flag Products',
  'UV Rigid Board Printing Products',
  'Window Blinds'
)
order by code;
