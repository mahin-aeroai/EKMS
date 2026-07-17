-- MMDI ONE — Sign Estimator schema (React rewrite of SignERP_v2.html)
--
-- WHAT THIS IS
-- The user built a standalone, single-file HTML/JS soft-signage costing
-- tool (localStorage-only) and asked for it to be rebuilt in React inside
-- MMDI ONE to create job/signage estimates, on one single screen. Per two
-- explicit choices made before this was written, this is a FULL rewrite
-- (not an iframe embed) with a FULL data migration to real Supabase tables
-- (not localStorage kept for later).
--
-- TABLES
--   7 master-data tables (the original tool's "Masters" section):
--     sign_profiles         - aluminium extrusion profiles (for the frame)
--     sign_led_modules      - SMD/LGP LED modules (grid-placed)
--     sign_led_bars         - LED bars (always placed vertically — see the
--                             calc engine's port for why)
--     sign_led_drivers      - LED power drivers
--     sign_sheets           - backing sheet materials (acrylic/PVC/ACP/LGP)
--     sign_printing_media   - print media (SEG fabric, flex, canvas, mesh)
--     sign_accessories      - hardware (joiners, screws, brackets, etc.)
--   1 transactional table:
--     sign_estimates        - one row per generated cost sheet/quote (the
--                             original tool's "History" + what feeds
--                             "Dashboard"). `calc` is a full JSON snapshot
--                             of the cost breakdown so a past estimate's
--                             cost sheet can be re-rendered exactly as it
--                             was, without recomputing against masters that
--                             may have since changed price.
--
-- WHY sku IS THE IDEMPOTENCY KEY FOR SEEDING
-- The original tool's DEFAULTS seed data doesn't have any other natural
-- unique key (ids were client-side localStorage ids like 'p1', 'lm1', not
-- meaningful here). Every default row does have a unique sku, so sku gets
-- a unique index and the seed INSERTs use ON CONFLICT (sku) DO NOTHING —
-- safe to run this file more than once, and user-added masters without a
-- sku are still allowed (unique index is a partial index, sku IS NOT NULL).
--
-- RLS
-- Gated to the 'customers' group, same as quotes/contracts/apple_lfg_sites
-- — this tool exists to produce customer-facing signage estimates, same
-- business domain as the Quotations workspace it will sit next to. Follows
-- the exact role+group policy pattern from supabase-module-access-migration.sql
-- (already live) — this file does NOT redefine user_role()/
-- user_has_group_access(), it only calls them, so it must run AFTER both
-- supabase-role-based-rls-migration.sql and supabase-module-access-migration.sql.
--
-- Validated against a real local Postgres instance (PGlite) before handoff —
-- see test-sign-estimator-schema.mjs. Whole file is idempotent (IF NOT
-- EXISTS / ON CONFLICT DO NOTHING / dynamic DROP POLICY IF EXISTS throughout).

-- ============================================================
-- STEP 1 — master data tables
-- ============================================================

create table if not exists public.sign_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('nonlit', 'seg-indoor', 'seg-outdoor')),
  width numeric,           -- profile cross-section width, mm
  depth numeric,           -- profile cross-section depth, mm
  stock_len numeric not null default 4000,  -- stock bar length, mm
  usage text,              -- 'Indoor' | 'Outdoor'
  cost numeric not null default 0,          -- cost per stock bar
  sku text,
  supplier text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sign_profiles_sku_key on public.sign_profiles (sku) where sku is not null;

create table if not exists public.sign_led_modules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mod_w numeric not null,      -- module width, mm
  mod_h numeric not null,      -- module height, mm
  h_gap numeric not null default 50,   -- default horizontal gap, mm
  v_gap numeric not null default 50,   -- default vertical gap, mm
  watt numeric not null default 0,
  ip text,                     -- ingress protection rating, e.g. IP20/IP65
  usage text,
  cost numeric not null default 0,
  sku text,
  supplier text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sign_led_modules_sku_key on public.sign_led_modules (sku) where sku is not null;

create table if not exists public.sign_led_bars (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  bar_len numeric not null,    -- stock bar length, mm
  bar_width numeric not null,  -- bar width, mm
  watt numeric not null default 0,
  ip text,
  usage text,
  cost numeric not null default 0,
  sku text,
  supplier text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sign_led_bars_sku_key on public.sign_led_bars (sku) where sku is not null;

create table if not exists public.sign_led_drivers (
  id uuid primary key default gen_random_uuid(),
  watt numeric not null,
  brand text,
  volt numeric not null default 24,
  cost numeric not null default 0,
  sku text,
  supplier text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sign_led_drivers_sku_key on public.sign_led_drivers (sku) where sku is not null;

create table if not exists public.sign_sheets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  width numeric not null,       -- full sheet width, mm
  height numeric not null,      -- full sheet height, mm
  thickness numeric,            -- mm
  cost_per_sheet numeric not null default 0,
  wastage numeric not null default 15,   -- default wastage %
  sku text,
  supplier text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sign_sheets_sku_key on public.sign_sheets (sku) where sku is not null;

create table if not exists public.sign_printing_media (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  print_types text[] not null default '{}',   -- e.g. {dye-sub, uv}
  cost_per_sqft numeric not null default 0,
  wastage numeric not null default 0,
  sku text,
  supplier text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sign_printing_media_sku_key on public.sign_printing_media (sku) where sku is not null;

create table if not exists public.sign_accessories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null default 'pcs',
  mandatory boolean not null default false,
  unit_cost numeric not null default 0,
  sku text,
  supplier text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sign_accessories_sku_key on public.sign_accessories (sku) where sku is not null;

-- ============================================================
-- STEP 2 — estimates (history + dashboard source)
-- ============================================================

create table if not exists public.sign_estimates (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,          -- e.g. QUOTE-2026-12345
  client text,
  category text,                     -- nonlit | seg-indoor | backlit-outdoor | outdoor-illum
  dim_w numeric,                     -- as entered by the user
  dim_h numeric,
  dim_unit text default 'mm',
  width_mm numeric not null default 0,
  height_mm numeric not null default 0,
  qty integer not null default 1,
  sell numeric not null default 0,        -- selling price ex-GST
  final_amount numeric not null default 0, -- final incl. GST
  margin numeric not null default 0,       -- gross margin %
  calc jsonb not null default '{}',        -- full cost breakdown snapshot for reprinting the cost sheet
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists sign_estimates_created_at_idx on public.sign_estimates (created_at desc);
create index if not exists sign_estimates_client_idx on public.sign_estimates (client);
create index if not exists sign_estimates_created_by_idx on public.sign_estimates (created_by);

-- ============================================================
-- STEP 3 — seed default master data (matches SignERP_v2.html's DEFAULTS)
-- ============================================================

insert into public.sign_profiles (name, category, width, depth, stock_len, usage, cost, sku, supplier) values
  ('15mm Non-Lit Indoor',    'nonlit',     15,  12,  4000, 'Indoor',  180,  'ALU-15-NL',   'Alumex'),
  ('23mm Non-Lit Indoor',    'nonlit',     23,  18,  4000, 'Indoor',  220,  'ALU-23-NL',   'Alumex'),
  ('50mm SEG Indoor',        'seg-indoor', 50,  40,  4000, 'Indoor',  350,  'ALU-50-SEG',  'Alumex'),
  ('63mm SEG Indoor',        'seg-indoor', 63,  50,  4000, 'Indoor',  420,  'ALU-63-SEG',  'Alumex'),
  ('70mm SEG Indoor',        'seg-indoor', 70,  55,  5000, 'Indoor',  480,  'ALU-70-SEG',  'Alumex'),
  ('80mm SEG Indoor',        'seg-indoor', 80,  60,  5000, 'Indoor',  550,  'ALU-80-SEG',  'Alumex'),
  ('100mm SEG Indoor',       'seg-indoor', 100, 80,  6000, 'Indoor',  680,  'ALU-100-SEG', 'Alumex'),
  ('130mm Outdoor SEG',      'seg-outdoor',130, 100, 5000, 'Outdoor', 980,  'ALU-130-OUT', 'Alumex'),
  ('150mm Outdoor SEG',      'seg-outdoor',150, 120, 6000, 'Outdoor', 1250, 'ALU-150-OUT', 'Alumex')
on conflict (sku) where sku is not null do nothing;

insert into public.sign_led_modules (name, mod_w, mod_h, h_gap, v_gap, watt, ip, usage, cost, sku, supplier) values
  ('2-Module SMD 3528',   36, 8,  50, 50, 0.48, 'IP20', 'Indoor',  6,  'LED-MOD-2',  'Generic'),
  ('3-Module SMD 5630',   36, 13, 50, 50, 0.72, 'IP20', 'Indoor',  8,  'LED-MOD-3',  'Generic'),
  ('5-Module SMD 5050',   60, 15, 60, 60, 1.44, 'IP65', 'Outdoor', 14, 'LED-MOD-5',  'Generic'),
  ('LGP Edge Module 14mm',14, 14, 20, 20, 0.3,  'IP20', 'Indoor',  12, 'LED-LGP-14', 'LGP Tech')
on conflict (sku) where sku is not null do nothing;

insert into public.sign_led_bars (name, bar_len, bar_width, watt, ip, usage, cost, sku, supplier) values
  ('LED Bar 600mm IP65',  600,  15, 5.0,  'IP65', 'Both',    120, 'LED-BAR-600',  'Generic'),
  ('LED Bar 900mm IP65',  900,  15, 7.5,  'IP65', 'Both',    160, 'LED-BAR-900',  'Generic'),
  ('LED Bar 1200mm IP65', 1200, 15, 10.0, 'IP65', 'Both',    200, 'LED-BAR-1200', 'Generic'),
  ('LED Bar 1800mm IP65', 1800, 15, 15.0, 'IP65', 'Outdoor', 280, 'LED-BAR-1800', 'Generic')
on conflict (sku) where sku is not null do nothing;

insert into public.sign_led_drivers (watt, brand, volt, cost, sku, supplier) values
  (40,  'Meanwell LPV-40-24',  24, 280,  'MW-40W',  'Meanwell'),
  (60,  'Meanwell LRS-60-24',  24, 350,  'MW-60W',  'Meanwell'),
  (100, 'Meanwell LRS-100-24', 24, 520,  'MW-100W', 'Meanwell'),
  (150, 'Meanwell LRS-150-24', 24, 680,  'MW-150W', 'Meanwell'),
  (200, 'Meanwell LRS-200-24', 24, 880,  'MW-200W', 'Meanwell'),
  (250, 'Meanwell LRS-250-24', 24, 1050, 'MW-250W', 'Meanwell'),
  (400, 'Meanwell RSP-400-24', 24, 1580, 'MW-400W', 'Meanwell')
on conflict (sku) where sku is not null do nothing;

insert into public.sign_sheets (name, width, height, thickness, cost_per_sheet, wastage, sku, supplier) values
  ('Acrylic Clear 3mm',       1220, 2440, 3, 950,  15, 'ACR-3MM',   'Generic'),
  ('Acrylic White 3mm',       1220, 2440, 3, 1050, 15, 'ACR-3MM-W', 'Generic'),
  ('PVC Foam Board 5mm',      1220, 2440, 5, 580,  12, 'PVC-5MM',   'Generic'),
  ('Aluminium Composite 3mm', 1220, 2440, 3, 1200, 10, 'ACP-3MM',   'Generic'),
  ('LGP Panel 6mm',           1220, 2440, 6, 2800, 8,  'LGP-6MM',   'LGP Tech')
on conflict (sku) where sku is not null do nothing;

insert into public.sign_printing_media (name, print_types, cost_per_sqft, wastage, sku, supplier) values
  ('SEG Silicone Edge Fabric', array['dye-sub','uv'],      45, 8, 'FAB-SEG',  'Generic'),
  ('Backlit Flex Banner',      array['solvent','uv'],       28, 5, 'FLEX-BL', 'Generic'),
  ('Polyester Fabric',         array['dye-sub'],            38, 8, 'FAB-POLY','Generic'),
  ('Canvas',                   array['uv','solvent'],        35, 7, 'CANVAS',  'Generic'),
  ('Mesh Banner',              array['solvent'],             22, 5, 'MESH-BN', 'Generic')
on conflict (sku) where sku is not null do nothing;

insert into public.sign_accessories (name, unit, mandatory, unit_cost, sku, supplier) values
  ('Corner Joiner',      'pcs', true,  25,  'CJ-01',    'Generic'),
  ('Flat Joiner',        'pcs', false, 45,  'FJ-01',    'Generic'),
  ('SS Screw M5x16',     'pcs', true,  2,   'SCR-M5',   'Generic'),
  ('Wall Bracket 150mm', 'pcs', false, 55,  'WB-150',   'Generic'),
  ('Hanging Clamp',      'pcs', false, 85,  'HC-01',    'Generic'),
  ('Wire Rope 3mm',      'm',   false, 45,  'WR-3MM',   'Generic'),
  ('Eye Bolt M8',        'pcs', false, 35,  'EB-M8',    'Generic'),
  ('Cleat Wall Mount',   'pcs', false, 120, 'CLEAT-01', 'Generic')
on conflict (sku) where sku is not null do nothing;

-- ============================================================
-- STEP 4 — RLS (role + 'customers' group, same pattern as
-- supabase-module-access-migration.sql's DO block — reuses its
-- user_role()/user_has_group_access() functions, does not redefine them)
-- ============================================================

DO $$
DECLARE
  target_table text;
  required_groups text[] := array['customers'];
  pol record;
  tables text[] := array[
    'sign_profiles', 'sign_led_modules', 'sign_led_bars', 'sign_led_drivers',
    'sign_sheets', 'sign_printing_media', 'sign_accessories', 'sign_estimates'
  ];
BEGIN
  FOREACH target_table IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = target_table
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);

      FOR pol IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = target_table
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, target_table);
      END LOOP;

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_role() IN (''admin'', ''editor'', ''viewer'') AND public.user_has_group_access(%L::text[]))',
        target_table || '_select_by_role', target_table, required_groups
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_role() IN (''admin'', ''editor'') AND public.user_has_group_access(%L::text[]))',
        target_table || '_insert_by_role', target_table, required_groups
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_role() IN (''admin'', ''editor'') AND public.user_has_group_access(%L::text[])) WITH CHECK (public.user_role() IN (''admin'', ''editor'') AND public.user_has_group_access(%L::text[]))',
        target_table || '_update_by_role', target_table, required_groups, required_groups
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.user_role() = ''admin'' AND public.user_has_group_access(%L::text[]))',
        target_table || '_delete_by_role', target_table, required_groups
      );

      RAISE NOTICE 'Applied group-scoped RLS to public.%', target_table;
    ELSE
      RAISE NOTICE 'Skipped % (table does not exist)', target_table;
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- Verification — should show 4 policies per table, 32 rows total
-- ============================================================
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'sign_profiles', 'sign_led_modules', 'sign_led_bars', 'sign_led_drivers',
    'sign_sheets', 'sign_printing_media', 'sign_accessories', 'sign_estimates'
  )
order by tablename, cmd;
