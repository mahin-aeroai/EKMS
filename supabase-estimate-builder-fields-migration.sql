-- MMDI ONE — Estimate Builder: additional fields
-- Run AFTER supabase-estimate-builder-schema.sql.
--
-- Adds the fields missing from the first pass, matching the real sample
-- quotes the user shared (39_MMDI_IKEA_Worli_Mumbai_Quote... and
-- 107_Quote_MMDI_Apple_Q4_2026...):
-- - Header: Attention person, Quote subject, Job completion time,
--   Delivery commitment, Payment terms (days) — IKEA defaults to 30,
--   Apple defaults to 45 (set client-side when the customer is picked;
--   this column just stores whatever ends up on the estimate).
-- - Per line item: Design (the campaign/creative name — IKEA's sample
--   calls this column "Design", separate from Product), Width/Height in
--   cm (with inches + total SQFT derived and stored alongside so the
--   printed quote can show all four the way the sample does), and
--   calc_mode so a line can be priced either "nos" (qty * rate, e.g.
--   Apple's A0 Posters/PIM lines) or "sqft" (total sqft * rate, e.g.
--   every LFG/vinyl line in both samples) — matches "Qty in nos or SQFT
--   should automatically calculate" from the line-item structure in both
--   samples: SQFT there is (width_in * height_in / 144) * qty, and Amount
--   is SQFT * Rate, not Qty * Rate, whenever the product is area-priced.
--
-- Idempotent: safe to re-run (every column uses IF NOT EXISTS).

alter table public.estimates
  add column if not exists attention_person text,
  add column if not exists quote_subject text,
  add column if not exists job_completion_time text,
  add column if not exists delivery_commitment text,
  add column if not exists payment_terms_days integer;

alter table public.estimate_line_items
  add column if not exists design_name text,
  add column if not exists calc_mode text not null default 'sqft' check (calc_mode in ('nos', 'sqft')),
  add column if not exists width_cm numeric,
  add column if not exists height_cm numeric,
  add column if not exists width_in numeric,
  add column if not exists height_in numeric,
  add column if not exists sqft_total numeric;
