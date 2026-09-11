-- ============================================================
-- LFG Connect — Material → Rate Card mapping
-- ============================================================
--
-- Context: 11 Sept 2026 task -- "LFG connect new rate card to update
-- finance data[,] if not matching with product ask me i will map it."
-- Srinivas uploaded a Rate Card (New rate Card for LFG.xlsx) covering the
-- 14 "LFG - Printing" SKUs -- the SAME Category/SKU ID/SKU Description/
-- Bill Rate/Program/Substrate/SQM/Revised Rate columns as MMDI's existing
-- Master Rate Card (see supabase-distribution-schema.sql), so those 14
-- SKUs import straight into the SAME distribution_rate_card table via the
-- Distribution tool's already-built Rate Card screen
-- (/workspaces/distribution/rate-card) -- matched/upserted by SKU ID,
-- nothing else touched, no new rate-card table needed here.
--
-- What IS new: lfg_sites.material is free text as typed/imported per site
-- (e.g. "Endutex BWX"), and the Rate Card's own Substrate column is ALSO
-- free text (e.g. "Endutex BWX 500") -- the two essentially never match
-- automatically. This table is the one-time, reusable mapping from a
-- `material` string actually seen on a site to the Rate Card SKU that
-- prices it -- mapped once per distinct material value from the "Apply
-- Rate Card" screen (LfgApplyRateCardDialog.tsx, opened from LFG Connect's
-- Estimates page) and reused automatically forever after for every site
-- carrying that same material. Exactly the same shape/reasoning as
-- distribution_item_type_rate_map -- see that table's own comment.
--
-- Rate conversion (confirmed with Srinivas): the Rate Card's "Revised Rate
-- (INR) Each" is a per-SQM price (the SQM column is always 1 -- "price for
-- one square metre" of that substrate), but MMDI's own site financials are
-- priced in SQFT (lfg_sites.sqft, lfg_site_financials.rate/amount) -- "we
-- use SQFt price convert and assign the rate". So the app converts:
--   rate (INR/sqft) = revised_rate_2026 / 10.7639
--   amount           = rate * lfg_sites.sqft
-- and writes ONLY lfg_site_financials.rate/amount for a site once its
-- material is mapped -- every other financial field (packing_forwarding,
-- gst_amount, installation_amount, etc.) is left exactly as it was, and a
-- staff member reviews a before/after preview per site before anything is
-- written (see LfgApplyRateCardDialog.tsx).
--
-- Depends on distribution_rate_card already existing (supabase-
-- distribution-schema.sql). Safe to re-run in full.
-- ============================================================

create table if not exists public.lfg_material_rate_map (
  material          text primary key,
  rate_card_sku_id  text references public.distribution_rate_card(sku_id),
  mapped_by         uuid references public.profiles(id),
  mapped_at         timestamptz not null default now()
);

-- ============================================================
-- Role-based RLS, matching distribution_item_type_rate_map exactly --
-- any staff role can read, admin/editor can create or change a mapping,
-- only admin can delete one outright.
-- ============================================================

DO $$
DECLARE
  target_table text;
  pol record;
  target_tables text[] := ARRAY['lfg_material_rate_map'];
BEGIN
  FOREACH target_table IN ARRAY target_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);

    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = target_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, target_table);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_role() IN (''admin'', ''editor'', ''viewer''))',
      target_table || '_select_by_role', target_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_role() IN (''admin'', ''editor''))',
      target_table || '_insert_by_role', target_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_role() IN (''admin'', ''editor'')) WITH CHECK (public.user_role() IN (''admin'', ''editor''))',
      target_table || '_update_by_role', target_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.user_role() = ''admin'')',
      target_table || '_delete_by_role', target_table
    );

    RAISE NOTICE 'Applied role-based RLS to public.%', target_table;
  END LOOP;
END $$;

-- ============================================================
-- Verification queries — run these after the block above
-- ============================================================

-- 1. Confirm the table exists with RLS on:
--    select relname, relrowsecurity from pg_class where relname = 'lfg_material_rate_map';

-- 2. Spot-check policies:
--    select policyname, cmd, roles from pg_policies where tablename = 'lfg_material_rate_map';
