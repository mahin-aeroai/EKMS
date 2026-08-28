-- ============================================================
-- LFG Connect: State/Region/MAT Code coverage report
-- ============================================================
--
-- Run this in the Supabase SQL Editor to see exactly how much of
-- lfg_sites is still missing State/Region/MAT Code/ASM/Partner after
-- supabase-lfg-permanent-sites-refresh-migration.sql -- that migration
-- only had 156 rows to work from (the "LFG 2026: Permanent Sites2.xlsx"
-- workbook's 3 sheets: APR +APP, Mono AAR Stores, Multi AAR), matched
-- strictly by SFO ID. Any lfg_sites row whose SFO ID wasn't one of those
-- 156 was correctly left untouched -- there was nothing to match it
-- against, not a bug in that migration.
--
-- Per-format breakdown: how many sites exist vs. how many still have a
-- gap in each field.
select
  format,
  count(*) as total_sites,
  count(*) filter (where sfo_id is null or sfo_id = '') as missing_sfo_id,
  count(*) filter (where state is null or state = '') as missing_state,
  count(*) filter (where region is null or region = '') as missing_region,
  count(*) filter (where mat_code is null or mat_code = '') as missing_mat_code,
  count(*) filter (where asm_name is null or asm_name = '') as missing_asm,
  count(*) filter (where partner_id is null) as missing_partner
from public.lfg_sites
group by format
order by total_sites desc;

-- Overall totals across every format.
select
  count(*) as total_sites,
  count(*) filter (where state is null or state = '') as missing_state,
  count(*) filter (where region is null or region = '') as missing_region,
  count(*) filter (where mat_code is null or mat_code = '') as missing_mat_code
from public.lfg_sites;

-- The actual list of sites still missing State (or Region/MAT Code --
-- swap the where clause) so you can see which specific outlets need a
-- source to fill from -- change the column in the where clause to check
-- a different field.
select site_id, outlet_name, format, sfo_id, city, state, region, mat_code
from public.lfg_sites
where state is null or state = ''
order by format, sfo_id;
