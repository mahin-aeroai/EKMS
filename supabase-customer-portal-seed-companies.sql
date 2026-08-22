-- ============================================================
-- Customer Portal: bulk-seed the first 10 retail chains (27 store
-- locations) from the existing customer master (public.customers),
-- per Srinivas's list of 28 CustomerAC codes (one duplicate code,
-- C07915, was given two different names -- resolved to "Unicorn
-- Infosolutions Private Limited" per his confirmation; the other
-- line, "... - Lulu Mall, Lucknow", has no valid code and is left
-- out until he supplies the correct one).
--
-- DESIGN DECISION (confirmed with Srinivas): several chains have one
-- customer-master row PER STATE (e.g. Venus Data Products has Mumbai/
-- Gujarat/Madhya Pradesh rows, Unicorn Info Solutions has ~11), each
-- almost certainly with its own state GSTIN. Rather than one portal
-- login per code (which would give Unicorn ~11 separate logins), we
-- keep "one login per chain" as originally designed, and instead move
-- GSTIN down to the STORE level so each store keeps its own correct
-- GSTIN for invoicing. That requires two new columns on
-- portal_company_stores (gstin, customer_code) added by STEP 0 below.
--
-- HOW TO RUN
-- Paste this entire file into the Supabase SQL Editor and run it in
-- one go (STEP 0 through the sanity-check SELECT at the end all need
-- to run in the same session, since the mapping lives in a temp table).
-- Safe to re-run: STEP 0 is idempotent, and the two INSERTs upsert on
-- portal_companies.name / portal_company_stores.customer_code.
--
-- AFTER RUNNING
-- 1. Check the sanity-check SELECT's output (should return 0 rows --
--    any row shown there is a customer_code with no match in
--    `customers`, meaning either a typo in this file or that
--    customer isn't in the master yet).
-- 2. Open /workspaces/customer-portal -> Companies tab, review each
--    of the 10 new chains: fill in any contact_name/phone/email that
--    came through blank, and double-check store addresses/GSTINs
--    look right for each store.
-- 3. The Unicorn Info Solutions store for C07915 was seeded with the
--    placeholder store name "Unicorn Infosolutions Private Limited
--    (location TBD)" since the original code had no location
--    attached -- rename it once you know which physical store it is.
-- 4. C07588 ("Wakad Mumbai") was seeded exactly as given, but Wakad is
--    a Pune locality, not Mumbai -- worth double-checking against the
--    customer master rather than assuming a typo either way.
-- 5. Company-level GSTIN/billing_address were only filled in for the
--    single-location chains (Ample Technologies, P3S Ventures, CS
--    Trade Link, Umang Business Consultant, Premium Lifestyle) -- for
--    the multi-state chains they're intentionally left blank at the
--    company level since GSTIN now lives per-store; fill in
--    billing_address at company level yourself if you want one shown
--    as a default.
-- 6. Portal login emails/invites are a separate manual step per chain
--    (Companies tab -> "Portal logins" -> Add invite), not done here
--    -- contact_email pulled from the customer master is only a
--    starting suggestion, not necessarily who should get the login.
-- ============================================================

-- ============================================================
-- STEP 0 -- add per-store GSTIN + customer-master cross-reference
-- ============================================================

alter table public.portal_company_stores add column if not exists gstin text;
alter table public.portal_company_stores add column if not exists customer_code text;

-- Plain (non-partial) unique index: a standard btree unique index already
-- treats every NULL as distinct from every other NULL, so stores with no
-- customer_code (added by hand later, outside this seed) are unaffected
-- -- and a plain index is required for ON CONFLICT (customer_code) below
-- to work (Postgres can't use a partial index as an ON CONFLICT arbiter
-- without repeating its predicate in every conflicting statement).
create unique index if not exists portal_company_stores_customer_code_idx
  on public.portal_company_stores(customer_code);

-- ============================================================
-- STEP 1 -- the code -> chain / store-label mapping
-- ============================================================

drop table if exists portal_company_map;
create temp table portal_company_map (
  customer_code text primary key,
  chain_name text not null,
  store_label text not null
);

insert into portal_company_map (customer_code, chain_name, store_label) values
  ('C04396', 'Premium Lifestyle And Fashion India Pvt Ltd', 'Hyderabad'),
  ('C06213', 'Venus Data Products Private Limited', 'Mumbai'),
  ('C07362', 'Venus Data Products Private Limited', 'Gujarat'),
  ('C08222', 'Venus Data Products Private Limited', 'Madhya Pradesh'),
  ('C05762', 'Ample Technologies Pvt Ltd', 'Ample Technologies Pvt Ltd'),
  ('C06702', 'Tresor Systems Private Limited', 'Kolkata'),
  ('C07124', 'Tresor Systems Private Limited', 'Jaipur'),
  ('C07478', 'Tresor Systems Private Limited', 'Punjab'),
  ('C07719', 'Tresor Systems Private Limited', 'Chandigarh'),
  ('C05289', 'NGRT Systems Private Limited', 'Nagpur'),
  ('C07178', 'NGRT Systems Private Limited', 'Indore'),
  ('C06007', 'Consolidated Private Limited', 'Karnataka'),
  ('C06525', 'Consolidated Private Limited', 'Maharashtra'),
  ('C07587', 'Unicorn Info Solutions Pvt Ltd', 'Oberoi Mall, Mumbai'),
  ('C07588', 'Unicorn Info Solutions Pvt Ltd', 'Wakad, Mumbai'),
  ('C06197', 'Unicorn Info Solutions Pvt Ltd', 'Andheri, Mumbai'),
  ('C07915', 'Unicorn Info Solutions Pvt Ltd', 'Unicorn Infosolutions Private Limited (location TBD)'),
  ('C07589', 'Unicorn Info Solutions Pvt Ltd', 'One Horizon, Gurugram'),
  ('C07586', 'Unicorn Info Solutions Pvt Ltd', 'MG Road, Pune'),
  ('C06566', 'Unicorn Info Solutions Pvt Ltd', 'JM Road, Pune'),
  ('C08191', 'Unicorn Info Solutions Pvt Ltd', 'Hazratganj'),
  ('C08201', 'Unicorn Info Solutions Pvt Ltd', 'Prahladnagar'),
  ('C08200', 'Unicorn Info Solutions Pvt Ltd', 'Infinity Mall, Mumbai'),
  ('C08213', 'Unicorn Info Solutions Pvt Ltd', 'Pacific Mall, West Delhi'),
  ('C07525', 'P3S Ventures Private Limited', 'P3S Ventures Private Limited'),
  ('C06193', 'CS Trade Link Private Limited', 'CS Trade Link Private Limited'),
  ('C08136', 'Umang Business Consultant Private Limited', 'Umang Business Consultant Private Limited');

-- ============================================================
-- STEP 2 -- one portal_companies row per chain (10 rows)
-- ============================================================

insert into public.portal_companies (name, contact_name, contact_phone, contact_email, gstin, billing_address)
select
  m.chain_name,
  (array_agg(c.default_attention_person order by m.customer_code) filter (where c.default_attention_person is not null))[1],
  (array_agg(c.contact_phone order by m.customer_code) filter (where c.contact_phone is not null))[1],
  (array_agg(c.contact_email order by m.customer_code) filter (where c.contact_email is not null))[1],
  case when count(*) = 1 then max(c.gstin) else null end,
  case when count(*) = 1 then max(c.address) else null end
from portal_company_map m
join public.customers c on c.code = m.customer_code
group by m.chain_name
having not exists (select 1 from public.portal_companies pc where pc.name = m.chain_name);

-- ============================================================
-- STEP 3 -- one portal_company_stores row per code (27 rows)
-- ============================================================

insert into public.portal_company_stores (company_id, store_name, address, city, gstin, customer_code)
select
  pc.id,
  m.store_label,
  c.address,
  c.region,
  c.gstin,
  m.customer_code
from portal_company_map m
join public.customers c on c.code = m.customer_code
join public.portal_companies pc on pc.name = m.chain_name
on conflict (customer_code) do update set
  store_name = excluded.store_name,
  address = excluded.address,
  city = excluded.city,
  gstin = excluded.gstin;

-- ============================================================
-- SANITY CHECK -- should return 0 rows. Any row here is a
-- customer_code in this file with no match in public.customers
-- (typo in this file, or that customer isn't in the master yet).
-- ============================================================

select m.customer_code, m.chain_name, m.store_label
from portal_company_map m
left join public.customers c on c.code = m.customer_code
where c.code is null;

-- ============================================================
-- SUMMARY -- what got created
-- ============================================================

select
  pc.name as chain_name,
  count(s.id) as store_count,
  pc.gstin as company_level_gstin,
  pc.contact_email
from public.portal_companies pc
left join public.portal_company_stores s on s.company_id = pc.id
where pc.name in (select distinct chain_name from portal_company_map)
group by pc.id, pc.name, pc.gstin, pc.contact_email
order by pc.name;
