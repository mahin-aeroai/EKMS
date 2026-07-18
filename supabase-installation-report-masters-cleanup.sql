-- MMDI ONE — Installation Report: clean up placeholder master data
-- Run this in the Supabase SQL Editor any time after
-- supabase-installation-report-master-migration.sql.
--
-- WHAT THIS DOES
-- The original master-data migration seeded Fixture Types / Materials /
-- Sign Types with generic placeholder values (my best guesses, before any
-- real data existed) so the pick-lists weren't empty on first use. Now
-- that Installation_Report_Site_Details_Fill_Me.xlsx has real, reviewed
-- values for every site, those placeholders — and a handful of Material
-- names from the first (pre-correction) import that got renamed during
-- your review — are just noise in the dropdowns. This:
--   1. Deletes the placeholder/stale values that were never real.
--   2. Adds the real distinct values used across the reviewed site data,
--      so the dropdowns match what's actually in use.
-- (A value already in use as free text on a report/site is stored as
-- plain text, not a foreign key, so removing it from a pick-list here
-- never touches or breaks any existing report data — it only changes
-- what shows up in the dropdown going forward.)
--
-- Safe to re-run.

-- ============================================================
-- Fixture Types
-- ============================================================

delete from public.installation_report_fixture_types
  where name in ('Entrance Signage', 'Table Talker', 'Wall Graphic', 'Ceiling Banner');

insert into public.installation_report_fixture_types (name) values
  ('Outdoor Backlit Fabric Sign'),
  ('Outdoor Non-lit Sign'),
  ('PVC Backlit Sign'),
  ('PVC Non-lit Sign'),
  ('SEG Backlit Fabric Sign')
on conflict (name) do nothing;

-- ============================================================
-- Sign Types
-- ============================================================

delete from public.installation_report_sign_types
  where name in ('Wall Mounted', 'Freestanding Display', 'Floor Graphic', 'Hanging Sign');

insert into public.installation_report_sign_types (name) values
  ('Backlit Fabric'),
  ('Fabric Backlit'),
  ('Fabric Non-lit'),
  ('PVC Backlit Banner'),
  ('PVC Non-lit Banner'),
  ('PVC One Way Vision')
on conflict (name) do nothing;

-- ============================================================
-- Materials — placeholder guesses AND 5 names from the first (pre-
-- correction) import that your review renamed to something else
-- ============================================================

delete from public.installation_report_materials
  where name in (
    'Vinyl', 'Acrylic', 'Foam Board', 'Aluminium Composite', 'Fabric',
    'Backlit Fabric - Senfa Pearl', 'Backlit Fabric - Senfa Pearl + Bleed',
    'Backlit Fabric - Senfa Pearl + Eyelets', 'Endutex Banner - Back Lit + Eyelets',
    'Soyang 601 UT Backlit Fabric + Bleed'
  );

insert into public.installation_report_materials (name) values
  ('3M IJ 48C + 3M 8050 Matt Lam'),
  ('3M IJ 8150 clear + Avery SC 900-152-S Blockout'),
  ('Endutex Banner - Back Lit'),
  ('Endutex Banner - Frontlit - BWX500'),
  ('One Way Vision'),
  ('Soyang 601 UT Backlit Fabric'),
  ('Soyang 601 UT Backlit Fabric + Eyelets'),
  ('Soyang216T Non-lit Fabric + Eyelets')
on conflict (name) do nothing;

-- ============================================================
-- Verification
-- ============================================================

-- select name from public.installation_report_fixture_types order by name;
-- select name from public.installation_report_sign_types order by name;
-- select name from public.installation_report_materials order by name;
