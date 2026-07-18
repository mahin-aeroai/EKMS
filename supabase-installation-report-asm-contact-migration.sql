-- MMDI ONE — Installation Report: ASM name + contact on Store Master
-- Run this in the Supabase SQL Editor any time after
-- supabase-installation-report-master-migration.sql.
--
-- WHAT THIS ADDS
-- Two optional columns on installation_report_stores so the report's Store
-- Information section can show who to contact at the store (Area/Assistant
-- Store Manager name + phone) instead of leaving that off the report
-- entirely. Both are plain text, editable from Manage Master Data
-- (Operations > Installation Report > Manage Master Data > Store Master)
-- same as every other Store Master field.
--
-- These start empty — a real ASM roster to bulk-fill them in is still
-- pending from you; once you send it over, importing it is a single SQL
-- UPDATE keyed on sfo_id, same pattern as the other data imports.
--
-- Safe to re-run.

alter table public.installation_report_stores
  add column if not exists asm_name text,
  add column if not exists asm_contact text;

-- ============================================================
-- Verification
-- ============================================================

-- select store_name, asm_name, asm_contact from public.installation_report_stores order by store_name limit 20;
