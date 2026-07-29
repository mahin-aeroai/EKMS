-- Corrective migration: your real Customer Master has 12 separate IKEA-
-- family accounts (one per GST/state entity), not one shared "IKEA India"
-- row. The original site seed (supabase-estimate-builder-schema.sql,
-- STEP 7) grabbed the first customer row matching '%IKEA%' — which turned
-- out to be "Ikea India Private Limited - Delhi2" (C07788) — and attached
-- ALL 10 sites to it. The address/GST/attention-person backfill then
-- copied Worli's specific data onto that Delhi2 row, which is why Riya
-- Patil (Worli's contact) showed up under a Delhi account, and every
-- other real IKEA account had nothing at all.
--
-- Fixed here, confirmed row-by-row against the real accounts:
--   Delhi Pacific Mall               -> Ikea India Pvt Ltd - Delhi          (C03998)
--   DLF Avenue, Saket, New Delhi     -> Ikea India Pvt Ltd - DLF AVE Delhi  (C08068)
--   Hyderabad Store                  -> Ikea India Pvt Ltd - TS             (C03694)
--   Hyderabad Sales Office           -> Ikea India Pvt Ltd - TS             (C03694)
--   INGKA Centre Delhi               -> Ingka Centres India Private Limited (C06372)
--   INGKA SERVICES LLP Bangalore     -> Ingka Services LLP                  (C08033)
--   IKEA Bangalore Store (Nagasandra)-> Ikea India Pvt Ltd - KA             (C03516)
--   IKEA Navi Mumbai Store           -> Ikea India Pvt Ltd - MH             (C03781)
--   IKEA Pune PMC                    -> Ikea India Pvt Ltd - Pune           (C05258)
--   IKEA Worli                      -> Ikea India Pvt Ltd - Worli          (C04730)
--
-- Left NULL on purpose (no address/GST on file for these at all, and
-- guessing would be worse than leaving them blank for you to fill in
-- directly): Ikea India Pvt Ltd - Banglore (C06512), - Gurugram (C04792),
-- - R City (C05007), Ikea Services India Private Limited - KA (C06268).
--
-- Idempotent: safe to re-run.

-- STEP 1 — clear the wrongly-populated Delhi2 row. No real site actually
-- belongs to it; Worli's data landed there by accident.
update public.customers
set address = null, gstin = null, default_attention_person = null
where code = 'C07788';

-- STEP 2 — repoint each of the 10 seeded customer_sites rows to its real
-- matching customer account.
update public.customer_sites cs
set customer_id = c2.id
from (
  values
    ('Delhi Pacific Mall', 'C03998'),
    ('DLF Avenue, Saket, New Delhi', 'C08068'),
    ('Hyderabad Store', 'C03694'),
    ('Hyderabad Sales Office', 'C03694'),
    ('INGKA Centre Delhi', 'C06372'),
    ('INGKA SERVICES LLP Bangalore', 'C08033'),
    ('IKEA Bangalore Store', 'C03516'),
    ('IKEA Navi Mumbai Store', 'C03781'),
    ('IKEA Pune PMC', 'C05258'),
    ('IKEA Worli', 'C04730')
) as map(site_name, customer_code)
join public.customers c2 on c2.code = map.customer_code
where cs.site_name = map.site_name;

-- STEP 3 — backfill address/GSTIN/attention person onto each of the 10
-- now-correctly-linked customer accounts, only where still blank (so this
-- never clobbers anything edited by hand since). Hyderabad Store and
-- Hyderabad Sales Office share one customer (C03694) and an identical
-- address, so it doesn't matter which of the two rows the join picks.
update public.customers c
set
  address = coalesce(c.address, cs.address),
  gstin = coalesce(c.gstin, cs.gstin),
  default_attention_person = coalesce(c.default_attention_person, cs.attention_person)
from public.customer_sites cs
where cs.customer_id = c.id;

-- Verification — every real IKEA/Ingka account and whether it now has
-- the right data (or is correctly still blank):
-- select code, name, address, gstin, default_attention_person
-- from public.customers
-- where name ilike '%ikea%' or name ilike '%ingka%'
-- order by name;
