-- MMDI ONE -- Material Ordering: add qty_per_pack to material_consumption_rows.
--
-- The refreshed "Import Material Purchases.xlsx" added a new column, "Qty
-- can be accomodated withing pack size" -- how many finished pieces of a
-- given SKU nest onto one pack/sheet/reel, per the user's own layout
-- knowledge. This is a materially better basis for packs-needed than the
-- SQM/pack-area geometric estimate the Order Builder falls back to, so it's
-- worth keeping as its own column rather than folding into an existing one.
--
-- Run this BEFORE supabase-material-ordering-consumption-import.sql's
-- refreshed version (which truncates and re-imports all rows, including
-- this column) -- see that file's header for why a truncate+reinsert is
-- used instead of a row-by-row diff.
--
-- Idempotent: `add column if not exists`.

alter table public.material_consumption_rows
  add column if not exists qty_per_pack numeric;
