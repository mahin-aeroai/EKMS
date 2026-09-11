-- MMDI ONE — Customer Portal: shipping/tracking + invoice download
-- (portal.mmdi.in)
--
-- WHAT THIS ADDS
-- Task feedback (Mahin, 11 Sept 2026, verbatim): "Add feature shipping to
-- portal.mmdi.in app with Bluedart tracking details. after receipt of the
-- order with payment we go and add shipping details to the site and
-- generate invoice for them and we will input CRN number and GSt invoice
-- format to you for customers to download."
--
-- Two new pieces, both scoped to an existing portal_orders row:
--   1. portal_order_shipments / portal_shipment_events — a courier
--      dispatch record per order (courier, AWB, live Blue Dart tracking),
--      shown to both staff and the owning customer. Deliberately mirrors
--      lfg_shipments / lfg_shipment_events (supabase-lfg-site-management-
--      schema.sql) column-for-column — same lifecycle vocabulary, same
--      event-log shape — so this reuses the app's existing Blue Dart
--      integration (trackAwb()/mapBlueDartStatusToLfg() in blueDart.ts,
--      SHIPMENT_STATUSES in lfgStatus.ts) as-is rather than inventing a
--      second one. A portal order ships as ONE consignment (unlike an LFG
--      site, which can have several), but the table still allows more
--      than one row per order (unique constraint deliberately omitted) in
--      case a large order ever has to go out as a split shipment.
--   2. portal_order_invoices — the GST invoice MMDI issues once an order
--      is paid. Staff types in the CRN number and invoice number/date and
--      uploads the invoice PDF (produced in MMDI's existing GST/billing
--      process, same as the rate-card and distribution-sheet workflows
--      elsewhere in this app) — the customer then sees a "Download
--      Invoice" button on their own order page. NOT an auto-generated GST
--      document: Mahin said "we will input CRN number and GST invoice
--      format to you" -- i.e. the exact invoice layout/format is still to
--      come, so this migration builds the storage + upload + download
--      plumbing now (fully working end to end) rather than guessing at
--      GST-compliant formatting that would be wrong to ship without the
--      real template. Same "ships now, on hold pending a file" split as
--      the LFG rate card and Distribution Tool rate-card import elsewhere
--      in this project.
--
-- Both new tables reuse the SAME staff/customer-ownership RLS shape as
-- every existing portal_order_* table (is_mmdi_staff() / portal_company_id()
-- helpers from supabase-customer-portal-schema.sql STEP 13 — unchanged,
-- just referenced here) and the SAME R2 presigned-URL file pattern as
-- portal_order_files (bytes never pass through the Next.js server).
--
-- ORDER TO RUN THIS IN
-- After supabase-customer-portal-schema.sql (needs portal_orders,
-- is_mmdi_staff(), portal_company_id() to already exist). Safe to re-run.

-- ============================================================
-- STEP 1 — portal_order_shipments
-- ============================================================

create table if not exists public.portal_order_shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.portal_orders(id) on delete cascade,
  courier text,
  awb_number text,
  dispatch_date date,
  expected_delivery_date date,
  number_of_packages integer,
  package_details text,
  -- Same lifecycle vocabulary as lfg_shipments.current_status (and the
  -- SHIPMENT_STATUSES/mapBlueDartStatusToLfg() code that already speaks
  -- it) — kept identical on purpose so this table needs no new mapping
  -- function.
  current_status text not null default 'shipment_created' check (current_status in (
    'shipment_created', 'dispatched', 'in_transit', 'at_hub',
    'out_for_delivery', 'delivered',
    'delayed', 'delivery_exception', 'undelivered'
  )),
  current_location text,
  delivery_date date,
  last_tracked_at timestamptz,
  internal_remarks text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create index if not exists portal_order_shipments_order_idx on public.portal_order_shipments(order_id);
create index if not exists portal_order_shipments_awb_idx on public.portal_order_shipments(awb_number);

-- One row per tracking-timeline event, identical shape to
-- lfg_shipment_events -- source='api' is the live Blue Dart plug-in
-- point, source='manual' covers every other courier (and Blue Dart before
-- its first live track).
create table if not exists public.portal_shipment_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.portal_order_shipments(id) on delete cascade,
  event_status text not null,
  event_time timestamptz not null default now(),
  location text,
  source text not null default 'manual' check (source in ('manual', 'api')),
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists portal_shipment_events_shipment_idx on public.portal_shipment_events(shipment_id);

-- ============================================================
-- STEP 2 — portal_order_invoices
-- ============================================================

create table if not exists public.portal_order_invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.portal_orders(id) on delete cascade,
  -- Staff-entered, free text -- the exact numbering/format is MMDI's own
  -- GST billing system's, not derived here. "CRN number" per Mahin's own
  -- wording; kept as its own column (not folded into invoice_number)
  -- since the two aren't guaranteed to be the same value.
  crn_number text,
  invoice_number text,
  invoice_date date,
  amount numeric,
  relative_path text not null,
  file_name text not null,
  uploaded_by uuid not null references auth.users(id),
  uploaded_by_role text not null default 'staff' check (uploaded_by_role in ('staff')),
  created_at timestamptz not null default now()
);

create index if not exists portal_order_invoices_order_idx on public.portal_order_invoices(order_id);

-- ============================================================
-- STEP 3 — RLS
-- ============================================================

alter table public.portal_order_shipments enable row level security;
alter table public.portal_shipment_events enable row level security;
alter table public.portal_order_invoices enable row level security;

-- portal_order_shipments -------------------------------------------------
drop policy if exists portal_order_shipments_select on public.portal_order_shipments;
drop policy if exists portal_order_shipments_write_staff on public.portal_order_shipments;
drop policy if exists portal_order_shipments_update_staff on public.portal_order_shipments;
drop policy if exists portal_order_shipments_delete_admin on public.portal_order_shipments;

create policy portal_order_shipments_select on public.portal_order_shipments
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (select 1 from public.portal_orders o where o.id = order_id and o.company_id = public.portal_company_id())
  );

create policy portal_order_shipments_write_staff on public.portal_order_shipments
  for insert to authenticated
  with check (public.user_role() in ('admin', 'editor'));

create policy portal_order_shipments_update_staff on public.portal_order_shipments
  for update to authenticated
  using (public.user_role() in ('admin', 'editor'))
  with check (public.user_role() in ('admin', 'editor'));

create policy portal_order_shipments_delete_admin on public.portal_order_shipments
  for delete to authenticated
  using (public.user_role() = 'admin');

-- portal_shipment_events ---------------------------------------------------
drop policy if exists portal_shipment_events_select on public.portal_shipment_events;
drop policy if exists portal_shipment_events_write_staff on public.portal_shipment_events;
drop policy if exists portal_shipment_events_delete_admin on public.portal_shipment_events;

create policy portal_shipment_events_select on public.portal_shipment_events
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (
      select 1 from public.portal_order_shipments s
      join public.portal_orders o on o.id = s.order_id
      where s.id = shipment_id and o.company_id = public.portal_company_id()
    )
  );

create policy portal_shipment_events_write_staff on public.portal_shipment_events
  for insert to authenticated
  with check (public.user_role() in ('admin', 'editor'));

create policy portal_shipment_events_delete_admin on public.portal_shipment_events
  for delete to authenticated
  using (public.user_role() = 'admin');

-- portal_order_invoices ---------------------------------------------------
drop policy if exists portal_order_invoices_select on public.portal_order_invoices;
drop policy if exists portal_order_invoices_write_staff on public.portal_order_invoices;
drop policy if exists portal_order_invoices_update_staff on public.portal_order_invoices;
drop policy if exists portal_order_invoices_delete_admin on public.portal_order_invoices;

create policy portal_order_invoices_select on public.portal_order_invoices
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (select 1 from public.portal_orders o where o.id = order_id and o.company_id = public.portal_company_id())
  );

create policy portal_order_invoices_write_staff on public.portal_order_invoices
  for insert to authenticated
  with check (uploaded_by_role = 'staff' and uploaded_by = auth.uid() and public.user_role() in ('admin', 'editor'));

create policy portal_order_invoices_update_staff on public.portal_order_invoices
  for update to authenticated
  using (public.user_role() in ('admin', 'editor'))
  with check (public.user_role() in ('admin', 'editor'));

create policy portal_order_invoices_delete_admin on public.portal_order_invoices
  for delete to authenticated
  using (public.user_role() = 'admin');

-- ============================================================
-- Verification queries — run these after applying the migration
-- ============================================================

-- 1. Confirm both new tables exist with RLS on:
--    select relname, relrowsecurity from pg_class
--      where relname in ('portal_order_shipments', 'portal_shipment_events', 'portal_order_invoices');

-- 2. As a staff (admin/editor) session: add a shipment to a paid order,
--    then POST /api/portal/shipments/<id>/track and confirm
--    portal_order_shipments.current_status and portal_shipment_events
--    both update.

-- 3. As that order's own portal customer: confirm the shipment/timeline
--    and any uploaded invoice are visible (read-only), and that a second
--    company's portal user gets zero rows for this order's shipments/
--    invoices.
