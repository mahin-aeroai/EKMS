-- ============================================================
-- Adds lfg_sites.hq_partner -- the reseller/franchise company that
-- operates the store (e.g. "PAI INTERNATIONAL ELECTRONICS LTD",
-- "VENUS DATA PRODUCTS PRIVATE LIMITED"), confirmed by Srinivas against
-- a real generated LFG Connect Updates report as a genuinely distinct
-- concept from:
--   - lfg_sites.format (the broad retail chain/category -- APR, Mono
--     AAR, Croma, Reliance, Vijay Sales, ...)
--   - lfg_sites.partner_id -> lfg_partners (the installation/execution
--     contractor -- MMDI or I&S -- who physically installs the display)
--
-- Purely additive, safe to run any time. No existing column/table is
-- touched. Run BEFORE supabase-lfg-fall2026-hq-partner-execution-
-- partner-import.sql, which fills this column in from Srinivas's real
-- execution tracker spreadsheet.
-- ============================================================

alter table public.lfg_sites
  add column if not exists hq_partner text;
