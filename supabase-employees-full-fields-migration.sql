-- Extends public.employees (currently just id/name/role/department/status/
-- status_label, an illustrative scaffold) with the real fields present in
-- MMDI's HR roster export ("MMDI Location Wise Emp Details"): employee
-- code, location/branch, official + personal contact details, date of
-- joining, date of birth, and gender.
--
-- NOTE ON SENSITIVITY: personal_email, personal_phone, dob, and gender are
-- personal data. This table uses the same role-based RLS as every other
-- table in the app (any authenticated admin/editor/viewer can read; only
-- admin/editor can write) -- see supabase-role-based-rls-migration.sql.
-- There is currently no extra restriction limiting who can see personal
-- contact/DOB fields specifically. If that's not the right level of access
-- for this data, say so and a tighter policy (e.g. admin-only for those
-- columns, or a separate view) can be added.
--
-- Idempotent, safe to re-run.

alter table public.employees
  add column if not exists employee_code text,
  add column if not exists location text,
  add column if not exists off_email text,
  add column if not exists off_phone text,
  add column if not exists personal_email text,
  add column if not exists personal_phone text,
  add column if not exists date_of_joining date,
  add column if not exists date_of_birth date,
  add column if not exists gender text;

-- Plain (non-partial) unique index -- see supabase-knowledge-files-fix-conflict-indexes.sql
-- for why partial indexes break a plain ON CONFLICT (col) clause. Employee
-- codes are unique per the source roster (0 duplicates, 0 nulls checked).
drop index if exists public.employees_employee_code_key;
create unique index if not exists employees_employee_code_key on public.employees (employee_code);

-- Verification: lists the new columns.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'employees'
order by ordinal_position;
