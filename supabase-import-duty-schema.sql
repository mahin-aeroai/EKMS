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
--   4. Fee replaced with Insurance % (default 1.125) -- the flat "Fee"
--      input is now insurance_percent, and insurance_amount = inv_value *
--      insurance_percent / 100 feeds into the assessable value instead.
--      1.125% of invoice/FOB value is the standard notional insurance rate
--      Indian customs uses when actual insurance isn't separately known
--      (Customs Valuation Rules 2007, Rule 10(2)) -- a real, commonly used
--      default, not an arbitrary placeholder.
-- BCD / SW Cess / IGST rates are editable PER PRODUCT LINE (not one rate
-- for the whole shipment) since real shipments mix HS codes with different
-- duty rates -- per the user's explicit answer.
--
-- Single table, frozen jsonb `lines` -- same convention as
-- material_orders.lines / sign_estimates.calc: once a calculation is
-- saved, it keeps showing exactly the numbers it showed at save time even
-- if exchange rates or duty rates change later. There's no reusable master
-- data behind this tool (unlike Material Ordering's suppliers/materials --
-- every shipment's products, rates and duty % are typically different), so
-- there's nothing to normalize into a separate table.
--
-- Formula per line (see CalculatorTab.tsx for the live implementation):
--   inv_value          = qty * rate * exchange_rate
--   insurance_amount   = inv_value * insurance_percent / 100
--   assessable_value   = inv_value + freight + insurance_amount
--   bcd_amount         = assessable_value * bcd_percent / 100
--   sw_cess_amount     = bcd_amount * sw_cess_percent / 100
--   igst_amount        = (assessable_value + bcd_amount + sw_cess_amount)
--                         * igst_percent / 100
--   total_duty         = bcd_amount + sw_cess_amount + igst_amount
--   total_cost         = inv_value + freight + freight_ex_works
--                         + clearing_charges + total_duty
--   cost_per_qty       = total_cost / qty
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
  -- Array of line items -- see CalculatorTab.tsx's ImportDutyLine shape for
  -- the exact fields (product_name, qty, rate, currency, exchange_rate,
  -- insurance_percent, freight, freight_ex_works, clearing_charges,
  -- bcd_percent, sw_cess_percent, igst_percent, plus every computed output
  -- above).
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
