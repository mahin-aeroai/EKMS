-- ============================================================
-- Portal cart: customer cancel = real delete of their own unpaid orders
-- ============================================================
-- Idempotent — safe to run more than once. Adds ONE new RLS policy;
-- everything else this feature needs already exists:
--   - portal_order_items.order_id and portal_order_files.order_id /
--     order_item_id already reference portal_orders(id) /
--     portal_order_items(id) "on delete cascade", so deleting a
--     portal_orders row already removes its items and file rows too.
--   - portal_orders_delete_admin already lets MMDI staff (role='admin')
--     delete any order. This adds the customer-facing counterpart, scoped
--     much more narrowly: a customer may only delete their OWN company's
--     orders, and only while they're genuinely unfinished (still unpaid).
--
-- Run this in the Supabase SQL Editor, then (same as any DDL/policy
-- change) it takes effect immediately -- no schema-cache reload needed
-- for RLS policy changes (unlike a new column, this isn't a PostgREST
-- schema-cache thing).

drop policy if exists portal_orders_delete_customer on public.portal_orders;

-- payment_status = 'unpaid' is the real gate here: an order becomes
-- "finished" the moment it's paid for (payment happens at checkout, before
-- the design-approval/production workflow even starts -- see
-- portal_orders_update_customer's comment in the main schema file). The
-- status check is defense-in-depth for a state that shouldn't be reachable
-- while unpaid anyway (production doesn't start on an unpaid order), same
-- layered-safety pattern used elsewhere in this schema.
create policy portal_orders_delete_customer on public.portal_orders
  for delete to authenticated
  using (
    company_id = public.portal_company_id()
    and payment_status = 'unpaid'
    and status not in ('in_production', 'completed', 'cancelled')
  );
