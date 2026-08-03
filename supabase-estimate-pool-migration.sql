-- MMDI ONE — Estimate Pool
--
-- "Sign estimator, Cost sheet and quotation tools ... I wanted to connect
-- together to create estimate to the customers so can we create a pool
-- where all sign estimates and cost sheet products then it is moved to
-- estimate module and there select the customers and create estimates."
--
-- estimate_pool_items is the shared staging area between Sign Estimator,
-- Cost Sheet, and Estimate Builder (the "Quotation" tool the user has in
-- mind is actually Estimate Builder -- /workspaces/quotations is a
-- read-only search/PDF-redownload view onto Estimate Builder's own
-- `estimates` table, not a separate builder with its own persistence).
--
-- Per three explicit choices made before this was written:
--   1. Items only join the pool via an explicit "Add to Pool" action in
--      Sign Estimator / Cost Sheet -- NOT automatically on every save, so
--      the pool doesn't fill up with drafts/test runs nobody meant to quote.
--   2. Pool items are customer-less -- the customer only gets picked once
--      inside Estimate Builder, when the item is pulled into an actual
--      estimate ("there select the customers and create estimates").
--   3. Once pulled into an estimate, a pool item is marked 'used' and
--      disappears from the pool -- prevents accidentally quoting the same
--      saved calculation to two different customers by mistake.
--
-- `summary` is a small denormalized jsonb snapshot (not a live join back
-- to the source tool) because the two source shapes are very different --
-- Sign Estimator's `sign_estimates.calc` is its own big JSON blob, and
-- Cost Sheet calculations aren't persisted ANYWHERE else today (the Cost
-- Sheet Calc tab has always been deliberately ephemeral -- see its own
-- header comment). Storing what's needed for display directly on the pool
-- row means Estimate Builder never has to understand either source tool's
-- internal schema, and "Add to Pool" effectively becomes Cost Sheet's
-- first save mechanism too.
--
-- source_ref_id points back at sign_estimates.id when source =
-- 'sign_estimator', for traceability (so you can still open the original
-- full cost sheet) -- it's intentionally NOT a foreign key, since a
-- 'cost_sheet' row has nothing to point at and must be allowed to leave it
-- null.
--
-- RLS: plain authenticated-only, matching supabase-cost-sheet-schema.sql
-- (this table is fed by Cost Sheet, which uses that pattern, not the
-- role+group pattern supabase-sign-estimator-schema.sql uses) -- see that
-- file's header for the reasoning.
--
-- Validated against a real local Postgres instance (PGlite) before
-- handoff. Idempotent (IF NOT EXISTS / dynamic DROP POLICY IF EXISTS).

create table if not exists public.estimate_pool_items (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('sign_estimator', 'cost_sheet')),
  source_ref_id uuid,                    -- sign_estimates.id when source = 'sign_estimator'; null for 'cost_sheet'
  label text not null,                   -- short display title, e.g. "UVSD-Vinyl — SO-1042" or "Backlit SEG Sign — Acme job"
  sell_amount numeric,                   -- top-line ₹ this item would sell for (ex-GST) -- becomes the new estimate line's unit_rate
  cost_amount numeric,                   -- top-line ₹ cost, shown for margin visibility while picking from the pool -- never written to the estimate itself
  summary jsonb not null default '{}',   -- denormalized display snapshot (dims, qty, cost breakdown) -- see header note
  status text not null default 'available' check (status in ('available', 'used')),
  used_in_estimate_id uuid references public.estimates (id) on delete set null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists estimate_pool_items_status_idx on public.estimate_pool_items (status);
create index if not exists estimate_pool_items_created_at_idx on public.estimate_pool_items (created_at desc);

-- ============================================================
-- RLS (plain authenticated-only, see header note)
-- ============================================================

DO $$
DECLARE
  pol record;
BEGIN
  ALTER TABLE public.estimate_pool_items ENABLE ROW LEVEL SECURITY;

  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'estimate_pool_items'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.estimate_pool_items', pol.policyname);
  END LOOP;

  CREATE POLICY estimate_pool_items_select_authenticated ON public.estimate_pool_items FOR SELECT TO authenticated USING (true);
  CREATE POLICY estimate_pool_items_insert_authenticated ON public.estimate_pool_items FOR INSERT TO authenticated WITH CHECK (true);
  CREATE POLICY estimate_pool_items_update_authenticated ON public.estimate_pool_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  CREATE POLICY estimate_pool_items_delete_authenticated ON public.estimate_pool_items FOR DELETE TO authenticated USING (true);
END $$;

-- ============================================================
-- Verification -- should show 4 policies, 4 rows
-- ============================================================
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'estimate_pool_items'
order by cmd;
