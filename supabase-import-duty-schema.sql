-- MMDI ONE -- Import Duty / Landing Cost Calculator
--
-- Ports "Import Duty calculation.xlsx" -- a per-shipment landed-cost
-- worksheet (Product / Qty / Rate / Exchange -> Invoice Value -> Assessable
-- Value -> BCD -> SW Cess -> Duty -> + Freight/Clearing Charges -> Total
-- Cost -> Cost per Qty) -- into its own standalone Tools workspace, per the
-- user's request to make the duty-rate percentages and every cost
-- component freely editable rather than baked into one static sheet.
--
-- Additions beyond the original sheet (per the user's own "if I missed
-- something add it too", the clarifying answers given before building, and
-- one correction made after checking a real supplier invoice against the
-- first version of this tool):
--   1. IGST -- the sheet only computed BCD + SW Cess. Real imports into
--      India are also charged IGST at the port, calculated on (Assessable
--      Value + BCD + SW Cess). Added as its own editable per-line %.
--   2. Multi-currency -- the sheet only had a EUR exchange-rate column.
--      currency + exchange_rate now live on each line, so a shipment
--      mixing EUR/USD/GBP invoices computes correctly.
--   3. inv_value corrected to qty * rate * exchange_rate -- the original
--      sheet's one sample row computed rate * exchange_rate with no qty
--      multiplication, which this tool initially preserved exactly. Once
--      the user tried it against a real Toray Textiles invoice, it was
--      clear "Rate" is a per-unit price (price per metre) and Qty * Rate
--      is the actual line value -- confirmed by matching the invoice's own
--      "Value" column (Metres x Price) exactly. The original sheet's
--      formula was simply wrong, not an intentional "Rate is a lump total"
--      design -- there was only ever the one sample row to go by.
--   4. Fee replaced with Insurance (default 0) -- the flat "Fee" input is
--      now `insurance`, a flat INR value like Freight/Freight-Ex-Works/
--      Clearing Charges (originally built as a 1.125% notional-insurance
--      % of invoice value -- the standard rate Indian customs uses when
--      actual insurance isn't separately known, Customs Valuation Rules
--      2007 Rule 10(2) -- but changed to a flat value per the user's own
--      preference, so it's entered directly from the actual policy/
--      invoice rather than estimated).
--   5. Freight / Freight-from-Ex-Works / Clearing Charges / Insurance
--      moved from PER-LINE inputs to SHIPMENT-LEVEL columns (freight,
--      freight_ex_works, clearing_charges, insurance below), per the
--      user's correction: a shipment is one Bill of Entry and these
--      costs are paid once for the whole shipment, not per product. Each
--      line's share is now derived by apportioning these shipment totals
--      pro-rata by that line's share of total invoice value -- see
--      CalculatorTab.tsx's computeAll() and each line's apportioned_*
--      fields inside `lines`.
--   6. Width / Height / UOM / Sq.Ft -- added per line so a landed cost
--      per SQ.FT can be shown alongside cost per Qty (not every imported
--      product is priced/compared by piece count). uom converts
--      mm/cm/inch/ft/m to feet; size_mode picks whether Qty is a piece
--      count (sqft = qty * width_ft * height_ft) or a running length off a
--      roll (sqft = qty_ft * width_ft, height not applicable) -- see
--      ImportDutySizeMode in packages/shared/src/rows.ts.
-- BCD / SW Cess / IGST rates are editable PER PRODUCT LINE (not one rate
-- for the whole shipment) since real shipments mix HS codes with different
-- duty rates -- per the user's explicit answer. Freight and Insurance ARE
-- part of the assessable (dutiable) value; Freight-from-Ex-Works and
-- Clearing Charges are NOT -- they're added straight into total_cost after
-- duty is calculated, matching standard CIF-based customs valuation
-- (pre-shipment domestic freight and post-clearance charges aren't part of
-- the import assessable value).
--
-- Single table, frozen jsonb `lines` -- same convention as
-- material_orders.lines / sign_estimates.calc: once a calculation is
-- saved, it keeps showing exactly the numbers it showed at save time even
-- if exchange rates or duty rates change later. There's no reusable master
-- data behind this tool (unlike Material Ordering's suppliers/materials --
-- every shipment's products, rates and duty % are typically different), so
-- there's nothing to normalize into a separate table.
--
-- Formula (see CalculatorTab.tsx's computeAll() for the live implementation):
--   Per line:
--     inv_value            = qty * rate * exchange_rate
--     sqft_total            = see ImportDutySizeMode above
--     ratio                = line.inv_value / SUM(all lines' inv_value)
--   Per line (apportioned, freight/insurance/ex-works/clearing are all flat
--   shipment-level INR values -- see the table columns below):
--     apportioned_freight            = freight * ratio
--     apportioned_insurance          = insurance * ratio
--     apportioned_freight_ex_works   = freight_ex_works * ratio
--     apportioned_clearing_charges   = clearing_charges * ratio
--     assessable_value     = inv_value + apportioned_freight + apportioned_insurance
--     bcd_amount           = assessable_value * bcd_percent / 100
--     sw_cess_amount       = assessable_value * sw_cess_percent / 100  -- NOT
--                             bcd_amount * sw_cess_percent -- corrected per
--                             the user's own real usage: BCD and SW Cess
--                             are each their own independent % of
--                             Assessable Value, so a 0% BCD line (a
--                             duty-free HS code) doesn't also zero out Cess.
--     igst_amount          = (assessable_value + bcd_amount + sw_cess_amount)
--                             * igst_percent / 100
--     total_duty           = bcd_amount + sw_cess_amount + igst_amount
--     total_cost           = inv_value + apportioned_freight
--                             + apportioned_freight_ex_works
--                             + apportioned_clearing_charges + total_duty
--     cost_per_qty         = total_cost / qty
--     cost_per_sqft        = total_cost / sqft_total
--
-- RLS: plain authenticated-only, matching every other internal-ops-tool
-- table in this schema family (see supabase-material-ordering-schema.sql).

create table if not exists public.import_duty_calculations (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  status text not null default 'draft' check (status in ('draft', 'final')),
  supplier_name text,
  invoice_no text,
  invoice_date date,
  bill_of_entry_no text,
  bill_of_entry_date date,
  notes text,
  -- Shipment-level cost components, paid once for the whole shipment (not
  -- per product) -- apportioned pro-rata across `lines` by invoice value,
  -- see header note above and each line's apportioned_* fields.
  freight numeric not null default 0,
  freight_ex_works numeric not null default 0,
  clearing_charges numeric not null default 0,
  insurance numeric not null default 0,
  -- Array of line items -- see CalculatorTab.tsx's ImportDutyLine shape for
  -- the exact fields (product_name, qty, rate, currency, exchange_rate,
  -- width, height, uom, size_mode, bcd_percent, sw_cess_percent,
  -- igst_percent, plus every computed output above, including the
  -- apportioned_* shares of this row's shipment-level costs).
  lines jsonb not null default '[]',
  -- Shipment-level rollups (sum of every line's total_cost / total_duty) --
  -- denormalized onto the header row purely so History can list/sort
  -- without unpacking jsonb.
  total_cost numeric not null default 0,
  total_duty numeric not null default 0,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists import_duty_calculations_status_idx on public.import_duty_calculations (status);
create index if not exists import_duty_calculations_created_at_idx on public.import_duty_calculations (created_at desc);

-- ============================================================
-- RLS (plain authenticated-only, see header note)
-- ============================================================

DO $$
DECLARE
  pol record;
BEGIN
  ALTER TABLE public.import_duty_calculations ENABLE ROW LEVEL SECURITY;

  FOR pol IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'import_duty_calculations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.import_duty_calculations', pol.policyname);
  END LOOP;

  EXECUTE 'CREATE POLICY import_duty_calculations_select_authenticated ON public.import_duty_calculations FOR SELECT TO authenticated USING (true)';
  EXECUTE 'CREATE POLICY import_duty_calculations_insert_authenticated ON public.import_duty_calculations FOR INSERT TO authenticated WITH CHECK (true)';
  EXECUTE 'CREATE POLICY import_duty_calculations_update_authenticated ON public.import_duty_calculations FOR UPDATE TO authenticated USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY import_duty_calculations_delete_authenticated ON public.import_duty_calculations FOR DELETE TO authenticated USING (true)';
END $$;

-- ============================================================
-- Verification -- should show 4 policies
-- ============================================================
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'import_duty_calculations'
order by cmd;
