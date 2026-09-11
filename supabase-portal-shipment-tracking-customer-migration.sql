-- MMDI ONE — Customer Portal: let a customer trigger live Blue Dart
-- tracking on their OWN shipment (portal.mmdi.in)
--
-- Task feedback (Mahin, 11 Sept 2026): on the order page, the "Track via
-- Blue Dart" button only showed for staff -- customers could see the
-- shipment but had no way to pull a fresh status themselves. Mirrors the
-- LFG Connect precedent exactly: lfg_shipments_write already grants a
-- partner full write access to their own site's shipments (no column
-- restriction -- see supabase-lfg-site-management-schema.sql), so a
-- partner's own tracking call can write current_status/events straight
-- through their own RLS-bound session. This migration grants the
-- equivalent to a portal customer for their own company's order
-- shipments, so /api/portal/shipments/[id]/track can do the same for
-- portal.mmdi.in instead of needing a service-role bypass (see
-- supabase-admin.ts's own header comment on why that's reserved for
-- requests with no real user session, which this has).
--
-- ORDER TO RUN THIS IN
-- After supabase-portal-shipping-invoicing-migration.sql (needs
-- portal_order_shipments / portal_shipment_events to already exist).
-- Safe to re-run.

drop policy if exists portal_order_shipments_update_customer on public.portal_order_shipments;
create policy portal_order_shipments_update_customer on public.portal_order_shipments
  for update to authenticated
  using (exists (select 1 from public.portal_orders o where o.id = order_id and o.company_id = public.portal_company_id()))
  with check (exists (select 1 from public.portal_orders o where o.id = order_id and o.company_id = public.portal_company_id()));

drop policy if exists portal_shipment_events_write_customer on public.portal_shipment_events;
create policy portal_shipment_events_write_customer on public.portal_shipment_events
  for insert to authenticated
  with check (
    exists (
      select 1 from public.portal_order_shipments s
      join public.portal_orders o on o.id = s.order_id
      where s.id = shipment_id and o.company_id = public.portal_company_id()
    )
  );

-- ============================================================
-- Verification — run after applying
-- ============================================================
-- As a portal customer session (their own order's shipment): POST
-- /api/portal/shipments/<id>/track and confirm portal_order_shipments
-- and portal_shipment_events both update. As a DIFFERENT company's
-- portal user: confirm the same call 404s/403s (ownership check in the
-- route itself, plus these policies as a second line of defense).
