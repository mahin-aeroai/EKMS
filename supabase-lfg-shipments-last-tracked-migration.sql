-- LFG Connect: Blue Dart live tracking -- "last checked" timestamp
-- (2 Sept 2026 -- see PROJECT_STATUS.md and
--  /root/.claude/plans/reactive-singing-abelson.md)
--
-- OPTIONAL. Adds one nullable column used only for a "Last checked N
-- minutes ago" UI hint on the Shipment tab and to avoid the "Track via
-- Blue Dart" button hammering the courier API on every click. Nothing
-- else in this feature depends on it -- safe to skip if not wanted, and
-- safe to run later at any time.
--
-- No RLS change: lfg_shipments_write already covers UPDATE for both
-- staff and the owning partner (supabase-lfg-site-management-schema.sql),
-- and this is a plain column addition, not a new policy.
--
-- Safe to re-run (add column if not exists).

alter table public.lfg_shipments
  add column if not exists last_tracked_at timestamptz;
