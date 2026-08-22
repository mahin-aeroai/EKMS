-- ============================================================
-- Customer Portal: seed GPX04 (Tactical Sign) and GPX05
-- (Compatibility Sign) into portal_products using REAL contract
-- pricing already on file in public.apple_rate_card (the same
-- 117-SKU Apple rate card the Estimate Builder and AI Copilot
-- already pull from) rather than a placeholder price.
--
-- Price convention: this file uses coalesce(rate_inr_each, bill_rate)
-- for the unit price -- the exact same fallback the Estimate Builder
-- uses when adding an Apple contract line item
-- (apps/web/src/app/workspaces/estimate-builder/page.tsx), so the
-- portal's price matches what the rest of MMDI ONE already treats as
-- "the" sell rate for a SKU.
--
-- HOW TO RUN
-- Paste the whole file into the Supabase SQL Editor and run it once.
-- STEP 1/2 are read-only diagnostics -- look at their output first.
-- STEP 3 is the actual write, and it's safe either way: if a code
-- doesn't match anything in apple_rate_card, its insert just finds 0
-- rows and does nothing (no placeholder/zero price gets written).
--
-- IMPORTANT -- if the Products tab still shows GPX04/GPX05 missing or
-- at ₹0 after running this, it almost certainly means the real SKU ID
-- in your rate card isn't literally "GPX04"/"GPX05" (Apple program
-- SKU IDs don't always match MMDI's own shorthand names). Check STEP
-- 1's output -- if it came back empty, STEP 1B searches by
-- description instead ("tactical"/"compatibility") so you can find
-- the real sku_id and tell me, and I'll fix the WHERE clause.
-- ============================================================

-- ============================================================
-- STEP 1 -- exact-code lookup (read-only)
-- ============================================================

select sku_id, sku_description, category, program, substrate, unit,
       bill_rate, rate_inr_each, start_date, end_date, sqft
from public.apple_rate_card
where upper(trim(sku_id)) in ('GPX04', 'GPX05')
order by sku_id, start_date;

-- ============================================================
-- STEP 1B -- fallback: search by description in case the real SKU ID
-- differs from "GPX04"/"GPX05" (read-only)
-- ============================================================

select sku_id, sku_description, category, program, substrate, unit,
       bill_rate, rate_inr_each, start_date, end_date, sqft
from public.apple_rate_card
where sku_description ilike '%tactical%' or sku_description ilike '%compatibility%'
order by sku_id;

-- ============================================================
-- STEP 2 -- warn if a code has more than one currently-valid rate
-- row (read-only). If this returns any rows, STEP 3 below will pick
-- the most recently started one automatically -- fine as a default,
-- but worth a manual look if you want a specific substrate/size.
-- ============================================================

select upper(trim(sku_id)) as code, count(*) as currently_valid_rows
from public.apple_rate_card
where upper(trim(sku_id)) in ('GPX04', 'GPX05')
  and (end_date is null or end_date >= current_date)
group by upper(trim(sku_id))
having count(*) > 1;

-- ============================================================
-- STEP 3 -- the actual write: upsert GPX04 and GPX05 into
-- portal_products from their current apple_rate_card row.
-- ============================================================

insert into public.portal_products (code, name, description, unit_price, gst_percent)
select
  'GPX04',
  'Tactical Sign',
  coalesce(r.sku_description, 'Apple-format store tactical signage'),
  coalesce(r.rate_inr_each, r.bill_rate, 0),
  18
from public.apple_rate_card r
where upper(trim(r.sku_id)) = 'GPX04'
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
  coalesce(r.sku_description, 'Apple-format store compatibility signage'),
  coalesce(r.rate_inr_each, r.bill_rate, 0),
  18
from public.apple_rate_card r
where upper(trim(r.sku_id)) = 'GPX05'
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
-- the row is simply missing, see the IMPORTANT note at the top.
-- ============================================================

select code, name, description, unit_price, gst_percent, active
from public.portal_products
where code in ('GPX04', 'GPX05')
order by code;
