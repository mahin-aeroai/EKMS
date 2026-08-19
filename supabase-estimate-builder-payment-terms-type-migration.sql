-- Estimate Builder previously only supported one payment-terms shape:
-- "Net N days from date of supply" (public.estimates.payment_terms_days).
-- Adds two real, selectable payment terms that aren't day-based at all:
-- "Advance Payment" and "Against Delivery".
--
-- payment_terms_type carries which of the three terms applies;
-- payment_terms_days stays as the day count ONLY when type = 'net_days'
-- (null for the other two -- there's no day count to show). Existing rows
-- all get backfilled to 'net_days' (safe: every estimate on file today was
-- created before this change, so it was always a days-based term).
--
-- Safe to re-run.

alter table public.estimates
  add column if not exists payment_terms_type text not null default 'net_days';

alter table public.estimates
  drop constraint if exists estimates_payment_terms_type_check;

alter table public.estimates
  add constraint estimates_payment_terms_type_check
  check (payment_terms_type in ('net_days', 'advance', 'against_delivery'));

-- Belt-and-suspenders: make sure no pre-existing row was left with a stray
-- payment_terms_days value under a non-'net_days' type (can't happen from
-- today's app code, but this guarantees the invariant regardless of how a
-- row got here).
update public.estimates
set payment_terms_days = null
where payment_terms_type <> 'net_days' and payment_terms_days is not null;
