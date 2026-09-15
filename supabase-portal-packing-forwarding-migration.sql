-- One-time migration: adds a flat "Packing & forwarding" charge to every
-- Customer Portal order. Run once in the Supabase SQL Editor. Safe to
-- re-run (idempotent).
--
-- Context (Mahin, verbatim): "add packing and forwarding option to bill and
-- make 1000/- for per delivery. If there are multiple store order and
-- multiplied by 1000." Checkout already creates one portal_orders row per
-- STORE (see NewOrderForm.tsx's CartGroup comment) -- so "per delivery"
-- maps directly onto "per portal_orders row", and charging a flat ₹1000 on
-- every order row already gives the "multiplied by 1000 for multiple
-- stores" behaviour for free, with no separate multiplication logic
-- needed: a 3-store checkout creates 3 portal_orders rows, each carrying
-- its own ₹1000, for ₹3,000 total.
--
-- Amount is a flat addition to total_amount, NOT run through GST -- the
-- request didn't mention tax on this charge, so it's treated the same way
-- a flat handling fee would be. Revisit if MMDI wants GST applied to it too.
--
-- New column defaults to 0 and is only ever set to 1000 by
-- POST /api/portal/orders (order creation) going forward -- existing
-- orders (already placed, paid or sitting unpaid in someone's cart) are
-- NOT retroactively charged; their total_amount stays exactly what it was
-- when placed, same "frozen at creation" treatment this schema already
-- gives delivery_address/delivery_city/delivery_gstin.

alter table public.portal_orders
  add column if not exists packing_forwarding_amount numeric not null default 0;
