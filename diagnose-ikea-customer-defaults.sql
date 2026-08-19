-- Diagnose: why IKEA's address/GSTIN/attention person still aren't
-- auto-loading in the Estimate Builder even after running
-- supabase-estimate-builder-jobno-productno-migration.sql.
--
-- The backfill in that migration only updates the ONE customers row whose
-- id matches customer_sites.customer_id for the 'IKEA Worli' site. If the
-- real 1,687-row Customer Master import already had its own "IKEA ..."
-- row (separate from whichever row the site data got attached to when
-- supabase-estimate-builder-schema.sql first ran), there could now be
-- TWO different customers rows with "IKEA" in the name — one with the
-- address/GST/contact filled in, one still blank — and the Estimate
-- Builder's Customer dropdown may be showing/selecting the blank one.
--
-- Run both queries and send me the results.

-- 1. Every customer row with "IKEA" in the name, and whether the backfill
--    actually landed on it.
select id, code, name, address, gstin, default_attention_person
from public.customers
where name ilike '%ikea%'
order by name;

-- 2. Which customer_id the seeded site data (address/GST/contact) is
--    actually attached to, by name, so you can match it against query 1.
select cs.customer_id, cs.site_name, cs.address, cs.gstin, cs.attention_person, c.name as customer_name
from public.customer_sites cs
join public.customers c on c.id = cs.customer_id
order by cs.site_name;
