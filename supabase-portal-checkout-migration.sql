-- One-time migration: multi-store checkout, mandatory PDF design files per
-- product, pay-at-checkout, and per-store GSTN. Run once in the Supabase
-- SQL Editor. Safe to re-run (every statement is idempotent).
--
-- Context: supabase-customer-portal-schema.sql originally modeled payment
-- as "approve the design proof, then pay" (one order = one store, one
-- razorpay_order_id). This migration keeps that schema but:
--   1. Adds a GSTN column per store (previously only at the company level)
--      — required by the app before a store can be selected when placing
--      an order, but NOT a NOT NULL constraint here: the ~26 already-seeded
--      stores don't have this filled in yet, and a hard constraint would
--      break them immediately on migration. Enforcement is at the
--      application layer (order creation, and the store picker) instead.
--   2. Lets a customer-uploaded file be tied to one specific line item
--      (order_item_id), not just the order as a whole — needed so "one
--      mandatory PDF per product" can actually mean per PRODUCT, not just
--      one loose file somewhere on the order.
--   3. Adds 'design' as a file kind, distinct from the existing optional
--      'reference' kind — this is the customer's mandatory per-product
--      artwork, not an optional extra attachment.
--   4. Lets a customer's order-update RLS check succeed while the order is
--      still 'submitted' (previously only 'approved'+ could be touched) —
--      required for pay-at-checkout, where razorpay_order_id gets written
--      onto a brand-new order immediately, before any design-approval step.

-- 1. Per-store GSTN.
alter table public.portal_company_stores add column if not exists gstin text;

-- 2. Link a file to one specific order line item (nullable — proofs and
--    generic reference/other files stay order-level, unchanged).
alter table public.portal_order_files
  add column if not exists order_item_id uuid references public.portal_order_items(id) on delete cascade;

create index if not exists portal_order_files_order_item_idx on public.portal_order_files(order_item_id);

-- 3. Allow the new 'design' file kind. Postgres names an inline column
--    check constraint "<table>_<column>_check" by default, which is what
--    portal_order_files' `kind` check got when the table was first
--    created — if your instance somehow named it differently, find the
--    real name first with:
--      select conname from pg_constraint where conrelid = 'public.portal_order_files'::regclass and contype = 'c';
--    and swap it into the DROP CONSTRAINT below.
alter table public.portal_order_files drop constraint if exists portal_order_files_kind_check;
alter table public.portal_order_files
  add constraint portal_order_files_kind_check check (kind in ('reference', 'proof', 'other', 'design'));

-- 4. RLS: allow pay-at-checkout (razorpay_order_id written while the order
--    is still 'submitted', not only once it reaches 'approved'), and allow
--    the customer's own 'design' file kind alongside the existing
--    'reference'/'other'. Re-created with the same names as
--    supabase-customer-portal-schema.sql so that file's own
--    `drop policy if exists` / `create policy` blocks stay the single
--    source of truth going forward — this migration just brings the live
--    database in line with what that file now also says.
-- No payment_status condition in WITH CHECK (deliberately — see the long
-- comment in supabase-customer-portal-schema.sql next to this same policy
-- for why a naive "= 'unpaid'" check would wrongly block approving/
-- reviewing a design on an order that's already paid, which is the normal
-- case now). Protecting that column is handled by the REVOKE below
-- instead, which is what actually matters for security here.
drop policy if exists portal_orders_update_customer on public.portal_orders;
create policy portal_orders_update_customer on public.portal_orders
  for update to authenticated
  using (
    company_id = public.portal_company_id()
    and status in ('submitted', 'proof_uploaded', 'revision_requested', 'approved')
  )
  with check (
    company_id = public.portal_company_id()
    and status in ('submitted', 'revision_requested', 'approved')
  );

-- The real protection against a customer ever marking their own order
-- paid: these three columns become structurally off-limits to the
-- authenticated role, independent of whatever any RLS policy says. Only
-- markOrderPaid (portal-payments.ts), running as the service-role client,
-- can set them — service_role bypasses RLS/grants entirely, so this has
-- no effect there.
revoke update (payment_status, razorpay_payment_id, paid_at) on public.portal_orders from authenticated;

drop policy if exists portal_order_files_insert_customer on public.portal_order_files;
create policy portal_order_files_insert_customer on public.portal_order_files
  for insert to authenticated
  with check (
    uploaded_by_role = 'customer'
    and uploaded_by = auth.uid()
    and kind in ('reference', 'other', 'design')
    and exists (select 1 from public.portal_orders o where o.id = order_id and o.company_id = public.portal_company_id())
  );
