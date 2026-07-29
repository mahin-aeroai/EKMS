-- MMDI ONE — Estimate Builder: Job No., Product No., customer-level
-- defaults, and the Apple contract/rate-card gap.
-- Run AFTER supabase-estimate-builder-versions-migration.sql.
--
-- WHAT THIS FIXES / ADDS
--
-- 1. JOB NO. — a new permanent, indexed column on estimates. User-typed
--    (not auto-generated), and per the user's instruction this becomes a
--    primary search key going forward — every version of an estimate
--    keeps the same job_number (it's about the job, not the version).
--
-- 2. PRODUCT NO. — a new column on estimate_line_items: the contract's
--    own item/serial number for that line (e.g. Apple's SKU ID, or
--    whatever numbering the customer's own contract document uses).
--    Free text, always editable — neither rate card table actually has a
--    reliable numeric serial in every case, so the app pre-fills a best
--    guess (Apple: sku_id: IKEA: position in the rate card list) and
--    lets the user correct it to match the real contract paperwork.
--
-- 3. CUSTOMER-LEVEL DEFAULTS (address / GSTIN / attention person). The
--    Billing Site dropdown is being removed from the Estimate Builder UI
--    per the user's request — one address/contact per customer from now
--    on, no more per-store picking. That means address/GST/contact must
--    come from `customers` itself, not `customer_sites`, the instant a
--    customer is selected. customers.address/gstin already exist (added
--    in the versions migration) but were never actually populated with
--    real data for anyone — that's why "address is still not loaded
--    automatically" kept happening even after that migration ran. This
--    migration adds customers.default_attention_person and backfills
--    IKEA's three columns from its Worli site record (the address used
--    in the very first sample quote). IMPORTANT CAVEAT: IKEA's real
--    sites span several different legal entities/GSTINs (IKEA India Pvt
--    Ltd, INGKA Centres India Pvt Ltd, INGKA Services LLP) with genuinely
--    different addresses — collapsing to one default is the simplification
--    the user chose; double-check/edit the address+GSTIN fields on each
--    estimate for stores other than Worli before sending. customer_sites
--    itself is untouched (kept for historical estimates already linked to
--    a site) — just no longer surfaced as a picker in the UI.
--
-- 4. APPLE — "Apple contract is not listing" turned out to be two
--    compounding gaps, not one: (a) apple_rate_card (117 real SKUs) was
--    never wired into the Estimate Builder's product picker at all — only
--    ikea_rate_card was (see the app-code change alongside this migration)
--    — and (b) there was no row in `contracts` for Apple, only for IKEA/
--    Reliance/Godrej, so the Contract dropdown had nothing to match even
--    once a customer named "Apple ..." was picked. Part (b) is fixed here:
--    create an Apple customers + contracts row if neither already exists,
--    the same defensive create-if-missing pattern as IKEA's seed in
--    supabase-estimate-builder-schema.sql. Part (a) is an app-code change.
--
-- Idempotent: safe to re-run.

-- ============================================================
-- STEP 1 — Job No. (estimates) + Product No. (line items)
-- ============================================================

alter table public.estimates
  add column if not exists job_number text;

create index if not exists estimates_job_number_idx on public.estimates(job_number);

alter table public.estimate_line_items
  add column if not exists product_no text;

-- ============================================================
-- STEP 2 — customer-level default attention person
-- ============================================================

alter table public.customers
  add column if not exists default_attention_person text;

-- ============================================================
-- STEP 3 — backfill IKEA's customer-level default (address / GSTIN /
-- attention person) from its Worli site record, only where still blank
-- so this never clobbers anything you've already edited by hand.
-- ============================================================

update public.customers c
set
  address = coalesce(c.address, cs.address),
  gstin = coalesce(c.gstin, cs.gstin),
  default_attention_person = coalesce(c.default_attention_person, cs.attention_person)
from public.customer_sites cs
where cs.customer_id = c.id
  and cs.site_name = 'IKEA Worli'
  and c.name ilike '%IKEA%';

-- ============================================================
-- STEP 4 — ensure Apple has a customers row AND a contracts row, so both
-- the Customer and Contract dropdowns actually have something to show.
-- No real address/GSTIN/contact was ever supplied for Apple in this
-- project (unlike IKEA) — left NULL on purpose rather than guessed; fill
-- those in via the Estimate Builder's now-editable address/GSTIN/
-- attention-person fields, or update this customers row directly once
-- you have Apple's registered details on hand.
-- ============================================================

do $$
declare
  v_customer_id uuid;
  v_contract_count int;
begin
  select id into v_customer_id from public.customers where name ilike '%apple%' limit 1;

  if v_customer_id is null then
    insert into public.customers (code, name, region, tier, payment_terms, account_owner, status, lifetime_value, open_orders, on_time_delivery, health_score, tags)
    values ('APPLE', 'Apple India Pvt Ltd', null, null, null, null, 'active', 0, 0, 0, 0, array[]::text[])
    returning id into v_customer_id;
  end if;

  select count(*) into v_contract_count from public.contracts where customer ilike '%apple%';

  if v_contract_count = 0 then
    insert into public.contracts (customer, type, value, status, status_label)
    values ('Apple India Pvt Ltd', 'Rate Card Agreement', 'apple_rate_card (117 SKUs)', 'success', 'Active');
  end if;
end $$;

-- ============================================================
-- Diagnostics — run these after the block above and send me the output
-- if the Contract dropdown still doesn't show Apple, or if Apple already
-- had a differently-named customers/contracts row this migration didn't
-- match (e.g. "Apple Inc" instead of "Apple India Pvt Ltd" — the app
-- matches on the first word of the customer name, lowercased, so any
-- name starting with "Apple" works).
-- ============================================================

-- select id, code, name, address, gstin, default_attention_person from public.customers where name ilike '%apple%';
-- select id, customer, type, value, status from public.contracts where customer ilike '%apple%';
-- select count(*) as apple_rate_card_rows from public.apple_rate_card;
-- select id, code, name, address, gstin, default_attention_person from public.customers where name ilike '%ikea%';
