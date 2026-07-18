-- MMDI ONE — Installation Report: multi-site stores + default sign details
-- Run this in the Supabase SQL Editor, after
-- supabase-installation-report-master-migration.sql.
--
-- WHAT THIS ADDS
-- Some stores have more than one installation site (e.g. a mall unit with
-- 3 separate fixture locations) — the original Apple LFG pricing sheet
-- tracked this per store as "No of Sites", along with the print Material
-- used. This migration adds those as columns on installation_report_stores
-- so the Installation Report tool can auto-create the right number of site
-- blocks (and pre-fill their sign details) the moment a store is picked,
-- instead of the operator adding + filling each one by hand.
--
--   no_of_sites          how many installation sites this store normally has (default 1)
--   default_fixture_type suggested Fixture Type for a new site at this store
--   default_material     suggested Material for a new site at this store
--   default_sign_type    suggested Sign Type for a new site at this store
--
-- All four are editable from Manage Master Data (Operations > Installation
-- Report > Manage Master Data > Store Master) and remain fully overridable
-- per site in the report form — they're just a starting point.
--
-- Safe to re-run (every ALTER uses IF NOT EXISTS).

alter table public.installation_report_stores
  add column if not exists no_of_sites integer not null default 1,
  add column if not exists default_fixture_type text,
  add column if not exists default_material text,
  add column if not exists default_sign_type text;

-- ============================================================
-- Verification
-- ============================================================

-- select store_name, no_of_sites, default_material from public.installation_report_stores order by store_name limit 20;
