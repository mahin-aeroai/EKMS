-- ============================================================
-- Distribution Tool — schema (Phase 1)
--
-- Seasonal Apple distribution jobs: each season's Apple "Distribution
-- Brief" sheet gets imported into distribution_seasons/stores/items,
-- store-wise packing labels are generated from that data, and (Phase 2)
-- pack/ship status + the 3 KNN hub shipments are tracked per season.
-- distribution_rate_card + distribution_item_type_rate_map (Phase 3)
-- support costing off Apple's Rate Card, using the 2026 revised price.
--
-- Run this whole file once in the Supabase SQL Editor. It assumes
-- public.user_role() already exists (created by
-- supabase-role-based-rls-migration.sql, applied earlier in this
-- project) -- it is NOT redefined here.
-- ============================================================

-- ============================================================
-- STEP 1 — tables
-- ============================================================

create table if not exists public.distribution_seasons (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,               -- e.g. "Fall 2026 — Q426 Sept IN Fabric Hero"
  dispatch_wave     text,                         -- Apple's own label, e.g. "10th Sept"
  source_file_name  text,
  status            text not null default 'draft' check (status in (
                       'draft', 'imported', 'packing', 'dispatched', 'completed'
                     )),
  imported_at       timestamptz,
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now()
);

create table if not exists public.distribution_stores (
  id                     uuid primary key default gen_random_uuid(),
  season_id              uuid not null references public.distribution_seasons(id) on delete cascade,
  sl_no                  int,
  sfo_id                 text not null,
  apple_id               text,
  fixture_id             text,
  store_name             text,
  reseller_name          text,
  programme              text,
  shipping_city          text,
  shipping_address_line1 text,
  shipping_address_line2 text,
  shipping_address_line3 text,
  shipping_state         text,
  shipping_postal_code   text,
  shipping_country       text,
  pos_address_line1      text,
  pos_address_line2      text,
  pos_address_line3      text,
  pos_city               text,
  pos_zip                text,
  total_units            int not null default 0,   -- denormalized sum of items.quantity, refreshed on import
  pack_status            text not null default 'pending' check (pack_status in (
                            'pending', 'packed', 'shipped', 'delivered'
                          )),
  packed_at              timestamptz,
  packed_by              uuid references public.profiles(id),
  remarks                text,
  unique (season_id, sfo_id)
);

create index if not exists distribution_stores_season_id_idx
  on public.distribution_stores(season_id);
create index if not exists distribution_stores_shipping_city_idx
  on public.distribution_stores(season_id, shipping_city);

create table if not exists public.distribution_items (
  id                       uuid primary key default gen_random_uuid(),
  store_id                 uuid not null references public.distribution_stores(id) on delete cascade,
  part_number              text,
  master_part_number       text,
  loc                      text,
  item_type                text,
  item_type_costs          text,
  deliverable_description  text,
  quantity                 int not null default 1,
  unit_price               numeric,
  amount                   numeric
);

create index if not exists distribution_items_store_id_idx
  on public.distribution_items(store_id);
create index if not exists distribution_items_item_type_idx
  on public.distribution_items(item_type);

create table if not exists public.distribution_shipments (
  id                      uuid primary key default gen_random_uuid(),
  season_id               uuid not null references public.distribution_seasons(id) on delete cascade,
  shipping_city           text not null,
  courier                 text not null default 'KNN — Air Cargo',
  awb_or_manifest_number  text,
  dispatch_date           date,
  box_count               int,
  total_units             int,
  status                  text not null default 'pending' check (status in (
                             'pending', 'dispatched', 'handed_to_knn'
                           )),
  internal_remarks        text,
  created_by              uuid references public.profiles(id),
  created_at              timestamptz not null default now(),
  unique (season_id, shipping_city)
);

create index if not exists distribution_shipments_season_id_idx
  on public.distribution_shipments(season_id);

create table if not exists public.distribution_rate_card (
  id                  uuid primary key default gen_random_uuid(),
  sku_id              text not null unique,
  category            text,
  program             text,
  substrate           text,
  unit                text,
  width_mm            numeric,
  height_mm           numeric,
  bill_rate_2023      numeric,
  revised_rate_2026   numeric,
  gsm_approval_name   text,
  remarks             text,
  imported_at         timestamptz not null default now()
);

create table if not exists public.distribution_item_type_rate_map (
  item_type          text primary key,
  rate_card_sku_id   text references public.distribution_rate_card(sku_id),
  mapped_by          uuid references public.profiles(id),
  mapped_at          timestamptz not null default now()
);

-- ============================================================
-- STEP 2 — role-based RLS, matching every sibling table
-- ============================================================

DO $$
DECLARE
  target_table text;
  pol record;
  target_tables text[] := ARRAY[
    'distribution_seasons', 'distribution_stores', 'distribution_items',
    'distribution_shipments', 'distribution_rate_card', 'distribution_item_type_rate_map'
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

    -- Any of the 3 roles can read.
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_role() IN (''admin'', ''editor'', ''viewer''))',
      target_table || '_select_by_role', target_table
    );
    -- Only admin/editor can create or modify records.
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_role() IN (''admin'', ''editor''))',
      target_table || '_insert_by_role', target_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_role() IN (''admin'', ''editor'')) WITH CHECK (public.user_role() IN (''admin'', ''editor''))',
      target_table || '_update_by_role', target_table
    );
    -- Only admin can delete.
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

-- 1. Confirm all 6 tables exist with RLS on:
--    select relname, relrowsecurity from pg_class
--    where relname in (
--      'distribution_seasons', 'distribution_stores', 'distribution_items',
--      'distribution_shipments', 'distribution_rate_card', 'distribution_item_type_rate_map'
--    );

-- 2. Spot-check policies on one table:
--    select policyname, cmd, roles from pg_policies where tablename = 'distribution_stores';

-- 3. Confirm public.user_role() exists (required by STEP 2 above):
--    select proname from pg_proc where proname = 'user_role';
