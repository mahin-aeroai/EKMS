-- MMDI ONE — Installation Reports: persistence schema
-- Run this in the Supabase SQL Editor
-- (Project: mahin-aeroai's Project, https://vzyrvzgtjcodxkjydxxn.supabase.co).
--
-- WHAT THIS ADDS
-- Installation reports have never been persisted anywhere. The entire form
-- lives in React state in InstallationReportClient.tsx (734 lines) and is
-- handed straight to pdfBuild.ts on export -- close the tab mid-report and
-- the work is gone, and there's no way for the mobile app (which needs to
-- file these from the field) to submit one at all. This is step 1 of 2
-- (schema, then the photo upload route) needed before either client can
-- persist a report; nothing here touches the existing PDF export path.
--
-- Three tables:
--   installation_reports              one row per report; snapshots the
--                                      store/team master data at filing time
--                                      (see below)
--   installation_report_site_entries  the repeatable per-site block
--                                      (fixture/material/sign type/size) --
--                                      same shape as the existing
--                                      installation_report_store_sites,
--                                      which supplies the defaults
--   installation_report_photos        one row per photo, keyed to either the
--                                      report (store-level) or one of its
--                                      site entries
--
-- SNAPSHOT, NOT JUST THE FK
-- store_name/address/sfo_id/program/asm_name/asm_contact and team_name are
-- copied onto installation_reports at creation time, not just referenced via
-- store_id/team_id. Master data changes over time (a store's ASM changes, a
-- team gets renamed) -- a filed report should read exactly as it did on the
-- day it was filed, not drift when the master row it pointed to is later
-- edited.
--
-- kind ON installation_report_photos
-- Checked apps/web/src/lib/installationReport/pdfBuild.ts rather than
-- inventing a taxonomy: values are the exact camelCase keys from its
-- StorePictures and SiteEntry types --
-- storeFullCover/installationCloseUp/streetView1/streetView2 are store-level
-- (site_entry_id null); mainSlide/closeUp/cornerTL/cornerTR/cornerBL/cornerBR
-- are per-site (site_entry_id set). Keeping the DB's kind identical to the
-- client's own object keys means loading a submitted report back into the
-- web client's state is a direct property assignment, not a translation
-- layer.
--
-- NO job_order_id
-- Checked: the existing installation-report flow (the component, pdfBuild,
-- masterConfig, and every installation-report-* migration to date) never
-- references job_orders anywhere -- it's entirely store-centric. Confirmed
-- with the user rather than adding a speculative FK for a cross-domain
-- relationship nothing in the app currently expresses.
--
-- RLS
-- Every sibling table in this app -- not just the installation_report_*
-- masters, literally every table in supabase-role-based-rls-migration.sql's
-- target list -- uses the same uniform role-based policy: any of
-- admin/editor/viewer can read, admin/editor can write, admin can delete.
-- No table anywhere uses row-ownership RLS (auth.uid() = created_by), so
-- that's not invented here either. "A supervisor only touches their own
-- report" is enforced by the upload route itself (see
-- src/app/api/installation-photos/upload-url/route.ts) -- the same place
-- knowledge-files/signed-url and lfg-surveys/signed-url already do checks
-- in route code that can't be expressed as a table policy.
--
-- Safe to re-run (idempotent: create table if not exists, policies dropped
-- and recreated).

-- ============================================================
-- STEP 1 — tables
-- ============================================================

create table if not exists public.installation_reports (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid references public.installation_report_stores(id),

  -- Snapshot of the store master row at filing time — see header comment.
  store_name        text not null,
  address           text,
  sfo_id            text,
  program           text,
  asm_name          text,
  asm_contact       text,

  season_program    text,
  installation_date date,
  team_id           uuid references public.installation_report_teams(id),
  team_name         text,

  status            text not null default 'draft' check (status in ('draft', 'submitted', 'reviewed')),
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  submitted_at      timestamptz,
  reviewed_at       timestamptz
);

create table if not exists public.installation_report_site_entries (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.installation_reports(id) on delete cascade,
  site_index    integer not null,
  fixture_type  text,
  material      text,
  sign_type     text,
  width_mm      numeric,
  height_mm     numeric,
  remarks       text,
  -- Mirrors installation_report_store_sites' own unique (store_id, site_index)
  -- — same integrity rule, same sibling table it's seeded from.
  unique (report_id, site_index)
);

create table if not exists public.installation_report_photos (
  id             uuid primary key default gen_random_uuid(),
  report_id      uuid not null references public.installation_reports(id) on delete cascade,
  -- null = store-level photo; set = belongs to that site entry.
  site_entry_id  uuid references public.installation_report_site_entries(id) on delete cascade,
  kind           text not null check (kind in (
                   'storeFullCover', 'installationCloseUp', 'streetView1', 'streetView2',
                   'mainSlide', 'closeUp', 'cornerTL', 'cornerTR', 'cornerBL', 'cornerBR'
                 )),
  relative_path  text not null,        -- R2 key
  captured_at    timestamptz,
  uploaded_at    timestamptz not null default now()
);

create index if not exists installation_report_site_entries_report_id_idx
  on public.installation_report_site_entries(report_id);
create index if not exists installation_report_photos_report_id_idx
  on public.installation_report_photos(report_id);
create index if not exists installation_report_photos_site_entry_id_idx
  on public.installation_report_photos(site_entry_id);

-- ============================================================
-- STEP 2 — role-based RLS, matching every sibling table
-- ============================================================

DO $$
DECLARE
  target_table text;
  pol record;
  target_tables text[] := ARRAY[
    'installation_reports', 'installation_report_site_entries', 'installation_report_photos'
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

-- 1. Confirm all 3 tables exist with RLS on:
--    select relname, relrowsecurity from pg_class
--    where relname in ('installation_reports', 'installation_report_site_entries', 'installation_report_photos');

-- 2. Spot-check policies on one table:
--    select policyname, cmd, roles from pg_policies where tablename = 'installation_reports';

-- 3. Confirm the FKs resolve (should return 0 rows -- no orphans possible on
--    an empty table, but useful after the app starts writing):
--    select count(*) from public.installation_reports where store_id is not null
--      and store_id not in (select id from public.installation_report_stores);
