-- LFG Connect: Blue Dart live tracking -- "current location" column
-- (5 Sept 2026 -- follow-up to supabase-lfg-shipments-last-tracked-
--  migration.sql, once Blue Dart's real API spec confirmed the tracking
--  response's shape)
--
-- Adds one nullable column, set from the most recent scan's
-- <ScannedLocation> every time "Track via Blue Dart" is used
-- (apps/web/src/app/api/lfg/shipments/[shipmentId]/track/route.ts).
-- expected_delivery_date already existed on this table (it was a manual
-- field) -- the same track call now also fills it in automatically from
-- Blue Dart's own <ExpectedDeliveryDate> when the courier provides one.
--
-- No RLS change: lfg_shipments_write already covers UPDATE for both
-- staff and the owning partner (supabase-lfg-site-management-schema.sql),
-- and this is a plain column addition, not a new policy.
--
-- Safe to re-run (add column if not exists).

alter table public.lfg_shipments
  add column if not exists current_location text;
