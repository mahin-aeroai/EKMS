-- Theory: the Estimate Builder's customer dropdown fetches
--   supabase.from("customers").select("*").order("name")
-- with no .range()/.limit() — and Supabase's PostgREST layer caps any
-- unpaginated query at 1000 rows by default. If the customers table has
-- grown past 1000 rows, only the first 1000 in alphabetical order come
-- back, silently dropping anything further down the alphabet. "Unicorn"
-- starts with U — exactly the kind of name that would fall off the end.

-- Total row count:
select count(*) as total_customers from public.customers;

-- Where "Unicorn Infosolutions Private Limited" would rank if the whole
-- table were sorted by name ascending (its position = how far into the
-- list you'd have to fetch to reach it):
select rank
from (
  select name, row_number() over (order by name) as rank
  from public.customers
) ranked
where name = 'Unicorn Infosolutions Private Limited';
