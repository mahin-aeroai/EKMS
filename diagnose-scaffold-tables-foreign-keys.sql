-- Same idea as diagnose-customer-foreign-keys.sql, extended to the other
-- pages that turned out to still be showing 100% sample data: suppliers,
-- sops, installation_sites, purchase_orders, work_orders, drawings,
-- lessons_learned, contracts. None of these have a real data import
-- committed anywhere in this repo (unlike customers/job_orders/
-- sales_transactions/raw_materials/finished_goods, which all do) -- this
-- finds every FK relationship touching them, in either direction, before
-- writing the actual cleanup so it doesn't fail partway through like the
-- customers delete did.

select
  tc.table_name as referencing_table,
  kcu.column_name as referencing_column,
  ccu.table_name as referenced_table,
  tc.constraint_name,
  rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
join information_schema.referential_constraints rc
  on rc.constraint_name = tc.constraint_name and rc.constraint_schema = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
  and (
    tc.table_name in ('suppliers', 'sops', 'installation_sites', 'purchase_orders', 'work_orders', 'drawings', 'lessons_learned', 'contracts')
    or ccu.table_name in ('suppliers', 'sops', 'installation_sites', 'purchase_orders', 'work_orders', 'drawings', 'lessons_learned', 'contracts')
  )
order by tc.table_name;

-- Row counts + a quick look at each, so I can confirm nothing real snuck
-- in before wiping (contracts especially -- want to see the Apple row
-- sitting alongside the 3 scaffold ones):
select 'suppliers' as t, count(*) from public.suppliers
union all select 'sops', count(*) from public.sops
union all select 'installation_sites', count(*) from public.installation_sites
union all select 'purchase_orders', count(*) from public.purchase_orders
union all select 'work_orders', count(*) from public.work_orders
union all select 'drawings', count(*) from public.drawings
union all select 'lessons_learned', count(*) from public.lessons_learned
union all select 'contracts', count(*) from public.contracts;

select * from public.contracts order by customer;
