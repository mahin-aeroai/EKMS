-- Quick check: does "Unicorn Infosolutions Private Limited" (or any of its
-- 6 sister entities under the same PAN, per Customer Master.xlsx) exist in
-- the customers table? If this returns 0 rows, that's why it's not
-- showing up in the Estimate Builder customer picker -- it was simply
-- never loaded into the app, not deleted by the earlier cleanup (that
-- cleanup only removed customers NOT in the master list; this one IS in
-- the master, code C07915).

select id, code, name, gstin, address
from public.customers
where name ilike '%unicorn%'
   or code in ('C07915', 'C07588', 'C07589', 'C07587', 'C07586', 'C06566', 'C06197')
order by code;
