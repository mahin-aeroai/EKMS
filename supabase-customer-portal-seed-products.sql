-- ============================================================
-- Customer Portal: seed GPX04 (Tactical Sign) and GPX05
-- (Compatibility Sign) into portal_products using REAL contract
-- pricing already on file in public.apple_rate_card (the same
-- 117-SKU Apple rate card the Estimate Builder and AI Copilot
-- already pull from) rather than a placeholder price.
--
-- REAL ROW IDENTITY (confirmed from Srinivas's rate card export):
-- Apple's own sku_id for these is NOT "GPX04"/"GPX05" -- those are
-- MMDI's internal shorthand, stored instead in sku_description as
-- "GPX04-APP" and "GPX05-APP":
--   sku_id 829-0000106, sku_description "GPX04-APP", Bill Rate 2,054.00
--   sku_id 829-0000107, sku_description "GPX05-APP", Bill Rate   100.00
-- Both run 09/08/23 -> 27/01/28 (contract still valid at time of
-- writing). This file therefore matches on sku_description (like
-- 'GPX04%' / 'GPX05%', so it also matches if a "-APP" suffix isn't
-- there for some other program), NOT sku_id.
--
-- Price convention: this file uses coalesce(rate_inr_each, bill_rate)
-- for the unit price -- the exact same fallback the Estimate Builder
-- uses when adding an Apple contract line item
-- (apps/web/src/app/workspaces/estimate-builder/page.tsx), so the
-- portal's price matches what the rest of MMDI ONE already treats as
-- "the" sell rate for a SKU. Given what's in the export above, expect
-- this to land on Bill Rate (₹2,054 / ₹100) unless rate_inr_each is
-- separately populated in the live table.
--
-- HOW TO RUN
-- Paste the whole file into the Supabase SQL Editor and run it once.
-- STEP 1/2 are read-only diagnostics -- look at their output first.
-- STEP 3 is the actual write, and it's safe either way: if a code
-- doesn't match anything in apple_rate_card, its insert just finds 0
-- rows and does nothing (no placeholder/zero price gets written).
-- ============================================================

-- ============================================================
-- STEP 1 -- lookup by description (read-only)
-- ============================================================

select sku_id, sku_description, category, program, substrate, unit,
       bill_rate, rate_inr_each, start_date, end_date, sqft
from public.apple_rate_card
where upper(trim(sku_description)) like 'GPX04%' or upper(trim(sku_description)) like 'GPX05%'
order by sku_description, start_date;

-- ============================================================
-- STEP 2 -- warn if a code has more than one currently-valid rate
-- row (read-only). If this returns any rows, STEP 3 below will pick
-- the most recently started one automatically -- fine as a default,
-- but worth a manual look if you want a specific substrate/size.
-- ============================================================

select
  case
    when upper(trim(sku_description)) like 'GPX04%' then 'GPX04'
    else 'GPX05'
  end as code,
  count(*) as currently_valid_rows
from public.apple_rate_card
where (upper(trim(sku_description)) like 'GPX04%' or upper(trim(sku_description)) like 'GPX05%')
  and (end_date is null or end_date >= current_date)
group by 1
having count(*) > 1;

-- ============================================================
-- STEP 3 -- the actual write: upsert GPX04 and GPX05 into
-- portal_products from their current apple_rate_card row.
-- ============================================================

insert into public.portal_products (code, name, description, unit_price, gst_percent)
select
  'GPX04',
  'Tactical Sign',
  'Apple-format store tactical signage (rate card: ' || r.sku_id || ')',
  coalesce(r.rate_inr_each, r.bill_rate, 0),
  18
from public.apple_rate_card r
where upper(trim(r.sku_description)) like 'GPX04%'
  and (r.end_date is null or r.end_date >= current_date)
order by r.start_date desc nulls last
limit 1
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  unit_price = excluded.unit_price,
  gst_percent = excluded.gst_percent,
  version = public.portal_products.version + 1,
  updated_at = now();

insert into public.portal_products (code, name, description, unit_price, gst_percent)
select
  'GPX05',
  'Compatibility Sign',
  'Apple-format store compatibility signage (rate card: ' || r.sku_id || ')',
  coalesce(r.rate_inr_each, r.bill_rate, 0),
  18
from public.apple_rate_card r
where upper(trim(r.sku_description)) like 'GPX05%'
  and (r.end_date is null or r.end_date >= current_date)
order by r.start_date desc nulls last
limit 1
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  unit_price = excluded.unit_price,
  gst_percent = excluded.gst_percent,
  version = public.portal_products.version + 1,
  updated_at = now();

-- ============================================================
-- SUMMARY -- what's in portal_products now. If unit_price is 0 or
-- the row is simply missing, re-check STEP 1's output above --
-- the description text in the live table may not start with
-- "GPX04"/"GPX05" exactly the way the export did.
-- ============================================================

select code, name, description, unit_price, gst_percent, active
from public.portal_products
where code in ('GPX04', 'GPX05')
order by code;
