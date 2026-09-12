-- ============================================================
-- Distribution Tool — Tracking Detail report
-- ============================================================
--
-- Context: 12 Sept 2026 task (Mahin, verbatim) -- "New Module within
-- distribution name it as Tracking Detail report ... fill and share the
-- report of the below columns in excel file named:
-- MMDI_Q426_FALL_Tracking_Master.xlsx", with Frankie_Head_Report.xlsx
-- attached as the Item Type (Costs) -> Group -> Rate Card SKU mapping.
--
-- Staff uploads the CURRENT MMDI_Q426_FALL_Tracking_Master.xlsx each time
-- the report is generated (it's Apple's own template -- this app doesn't
-- model every one of its ~59 columns) and this module fills just the 16
-- target tracking columns in place, resolving each row's Group off
-- distribution_deliverable_groups (keyed on item_type_costs, e.g.
-- "GPF24 - fabric print" -- NOT the same field as item_type, which is
-- what the existing distribution_item_type_rate_map keys on) and then its
-- tracking facts off distribution_tracking_entries (keyed on that Group +
-- the row's own Shipping City -- already a column in the uploaded file).
--
-- Both new tables are the SAME reusable-mapping shape as
-- distribution_item_type_rate_map / lfg_material_rate_map: mapped once,
-- reused automatically forever after for every row carrying that same
-- item_type_costs / group+city.
--
-- Depends on distribution_seasons + distribution_rate_card already
-- existing (supabase-distribution-schema.sql). Safe to re-run in full --
-- the seed INSERT below is an upsert (ON CONFLICT DO NOTHING), so it will
-- never clobber a mapping staff already edited from the app.
-- ============================================================

-- ============================================================
-- STEP 1 — project_code (single value per season, per Mahin's spec:
-- "Project code : single entry")
-- ============================================================

alter table public.distribution_seasons
  add column if not exists project_code text;

-- ============================================================
-- STEP 2 — tables
-- ============================================================

create table if not exists public.distribution_deliverable_groups (
  item_type_costs   text primary key,           -- e.g. "GPF24 - fabric print" (distribution_items.item_type_costs)
  group_name        text not null,               -- e.g. "GPF - Rhine Group" (Frankie Head Report's "Group" column)
  split_note        text,                         -- e.g. "Split between Bengaluru New Delhi and Taluka Biwandi" -- staff reference only, not used in fill logic
  rate_card_sku_id  text references public.distribution_rate_card(sku_id),
  mapped_by         uuid references public.profiles(id),
  mapped_at         timestamptz not null default now()
);

create index if not exists distribution_deliverable_groups_group_name_idx
  on public.distribution_deliverable_groups(group_name);

create table if not exists public.distribution_tracking_entries (
  id                uuid primary key default gen_random_uuid(),
  season_id         uuid not null references public.distribution_seasons(id) on delete cascade,
  group_name        text not null,
  shipping_city     text not null,
  -- Estimate Number is conceptually per-Group only (not per-City), but is
  -- stored redundantly on every City row under the same Group -- the UI
  -- (TrackingDetailClient.tsx) is responsible for keeping it in sync
  -- across a Group's City sub-rows when edited.
  estimate_number   text,
  delivery_note     text,                         -- "Delivery Note/ Email Contact" -- any text here also drives Units Shipped/Delivered = Quantity
  courier           text,
  tracking_number   text,
  dispatch_date     date,
  eta               date,
  pod_date          date,
  pod_name          text,
  updated_by        uuid references public.profiles(id),
  updated_at        timestamptz not null default now(),
  unique (season_id, group_name, shipping_city)
);

create index if not exists distribution_tracking_entries_season_id_idx
  on public.distribution_tracking_entries(season_id);

-- ============================================================
-- STEP 3 — role-based RLS, matching every sibling table
-- ============================================================

DO $$
DECLARE
  target_table text;
  pol record;
  target_tables text[] := ARRAY[
    'distribution_deliverable_groups', 'distribution_tracking_entries'
  ];
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
-- STEP 4 — seed distribution_deliverable_groups from Frankie Head
-- Report's 52 Item Type (Costs) -> Group -> SKU rows. ON CONFLICT DO
-- NOTHING so re-running this file never overwrites a mapping staff has
-- since edited from the app.
-- ============================================================

insert into public.distribution_deliverable_groups (item_type_costs, group_name, split_note, rate_card_sku_id) values
  ('A0 Poster', 'AO posters Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000007'),
  ('A2 Tabletop Graphic GPX03', 'Multi AAR GPX Group', 'Only to INS Pickup', '829-0000105'),
  ('AARGPS12 - 1375.4 x 1200mm (Primex prepaid by Apple)', 'Multi AAR GPS Group', 'Only to INS Pickup', '829-0000098'),
  ('AARGPS13 - 1875.4 x 1200mm (Primex prepaid by Apple)', 'Multi AAR GPS Group', 'Only to INS Pickup', '829-0000099'),
  ('APR 2.5 B GPF23 Window Panel', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000016'),
  ('APR 2.5 Double A0 Vertical GPF33 Window Panel', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000022'),
  ('APR 2.5 GPF21 Cashwrap', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000014'),
  ('APR 2.5 GPF23 Cashwrap', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000016'),
  ('APR 2.5 Panel B GPF22 Window Panel', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000015'),
  ('APR B GPF23 Cash Wrap', 'GPF - MT3180 Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000011'),
  ('APR GPF21 Cash Wrap', 'GPF - MT3180 Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000009'),
  ('AS3 GPF70 Focal Graphic 3-Bay Low', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000034'),
  ('GPF101 - Fabric Panel (APPC Interior)', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000067'),
  ('GPF15 – 1000x1291mm', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000024'),
  ('GPF16 – 1220x1291mm', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000025'),
  ('GPF17 – 1000x841mm', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000026'),
  ('GPF18 – 1220x841mm', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000027'),
  ('GPF22 - fabric print', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000015'),
  ('GPF24 - fabric print', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000017'),
  ('GPF25 - Fabric Panel (APPC Exterior)', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000018'),
  ('GPF25 - Fabric Panel (APPC Interior)', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000018'),
  ('GPF25 - fabric print', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000018'),
  ('GPF26 - fabric print', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000019'),
  ('GPF62 Fabric Panel (APP)', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000028'),
  ('GPF62 Window Panel (APP)', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000028'),
  ('GPF63 Fabric Panel (APP)', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000029'),
  ('GPF63 Window Panel', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000029'),
  ('GPF64 Fabric Panel (APP)', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000030'),
  ('GPF64 Window Panel', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000030'),
  ('GPF67 Window Panel', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000031'),
  ('GPF68 Fabric Panel', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000032'),
  ('GPF68 Fabric Panel (APP)', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000032'),
  ('GPF69 Fabric Panel (APP)', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000033'),
  ('GPF70 Fabric Panel', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000034'),
  ('GPF71 - fabric print', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000035'),
  ('GPF71 Fabric Panel (APP)', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000035'),
  ('GPF71 Window Panel', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000035'),
  ('GPF72 Fabric Panel (APP)', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000036'),
  ('GPF72 Window Panel (APP)', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000036'),
  ('GPF81 Fabric Panel (APP)', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000038'),
  ('GPF83 - fabric print', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000050'),
  ('GPF84 - fabric print', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000051'),
  ('GPF85 - fabric print', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000052'),
  ('GPF87 - fabric print', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000054'),
  ('GPF88 - fabric print', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000055'),
  ('GPF94 Fabric Panel (ASC)', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000061'),
  ('GPF95 Fabric Panel (ASC)', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000062'),
  ('GPF96 Fabric Panel (ASC)', 'GPF - Rhine Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000063'),
  ('Horizontal Wall Graphic GPX01', 'AO posters Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000008'),
  ('Shared Proximity Sign 01 (270x96.5)', 'Proximity Sign Group', 'Split between Bengaluru New Delhi and Taluka Biwandi', '829-0000074'),
  ('GPS19-MULTIBRAND-AAR_AI_1110x496_(Primex prepaid by Apple)', 'Multi AAR GPS Group', 'Only to INS Pickup', '829-0000101'),
  ('GPS18-MULTIBRAND-AAR_AI_846x396(Primex prepaid by Apple)', 'Multi AAR GPS Group', 'Only to INS Pickup', '829-0000100')
on conflict (item_type_costs) do nothing;

-- ============================================================
-- Verification queries — run these after the block above
-- ============================================================

-- 1. Confirm both tables exist with RLS on:
--    select relname, relrowsecurity from pg_class
--    where relname in ('distribution_deliverable_groups', 'distribution_tracking_entries');

-- 2. Spot-check policies:
--    select policyname, cmd, roles from pg_policies where tablename = 'distribution_deliverable_groups';

-- 3. Confirm the seed landed (expect 52):
--    select count(*) from public.distribution_deliverable_groups;

-- 4. Confirm project_code was added:
--    select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'distribution_seasons' and column_name = 'project_code';
