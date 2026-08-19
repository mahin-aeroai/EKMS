-- MMDI ONE — Estimate Builder: versioning + customer address/GST
-- Run AFTER the other supabase-estimate-builder-*.sql migrations.
--
-- 1. VERSIONING. Editing a saved estimate never overwrites it — it creates
--    a new row (V2, V3, ...) linked back to the original via
--    root_estimate_id, so every version anyone ever generated a PDF from
--    stays in the database exactly as it was. `version` = 1 for the first
--    save of an estimate; root_estimate_id is NULL on that first row (it
--    IS the root) and points at the original's id on every later version.
--    quote_number stays unique per row: V1 keeps the plain generated
--    number (e.g. IKEA-EST-0001), V2+ appends "-V2"/"-V3"/... to that same
--    base number — the app computes this, this migration just adds the
--    columns.
--
-- 2. CUSTOMER ADDRESS / GST. The "To," block was coming up blank for any
--    customer without a billing site on file (only IKEA has
--    customer_sites rows so far) since customers itself never had an
--    address/GSTIN. Two fixes:
--    - customers.address / customers.gstin: a customer-level fallback.
--    - estimates.customer_address / estimates.customer_gstin: a SNAPSHOT
--      on the estimate itself (like product_name/unit_rate on line
--      items) — auto-filled from the picked site or the customer record,
--      but always editable and always saved, so it's never silently
--      missing just because neither of those had data on file yet.
--
-- Idempotent: safe to re-run.

alter table public.customers
  add column if not exists address text,
  add column if not exists gstin text;

alter table public.estimates
  add column if not exists version integer not null default 1,
  add column if not exists root_estimate_id uuid references public.estimates(id),
  add column if not exists customer_address text,
  add column if not exists customer_gstin text;

create index if not exists estimates_root_estimate_id_idx on public.estimates(root_estimate_id);
