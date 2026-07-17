-- Extends public.compliance_findings with real fields from the IWAY internal
-- audit checklist ("G1_2 Internal IWAY Audit Checklist.xlsx") so the
-- Compliance workspace can show real audit/training/license renewal dates
-- and cadences instead of the placeholder rows it had before.
--
-- category         'Internal Audit' | 'Training' | 'License/Certificate' | 'Compliance Document'
-- chapter          IWAY chapter reference (e.g. "G1.2") for traceability back to the checklist
-- frequency         renewal cadence as written in the checklist (Annual, Half Yearly, Quarterly,
--                   Weekly, Monthly, "3 Years", Systemic, Permanent, "As and when required", Combined)
-- baseline_date    the last known date this was done/renewed, taken from the checklist's
--                   "Next renewal" column (which despite the header is really the last dated
--                   entry on file, not a future date -- several are years in the past)
-- due_date         computed: baseline_date advanced by `frequency` until it lands in the future.
--                   NULL where there's no baseline date to compute from (see note below).
-- responsible      role named in the checklist's "Responsible" column

alter table public.compliance_findings
  add column if not exists category text,
  add column if not exists chapter text,
  add column if not exists frequency text,
  add column if not exists baseline_date date,
  add column if not exists due_date date,
  add column if not exists responsible text;

-- Verify
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'compliance_findings'
order by ordinal_position;
