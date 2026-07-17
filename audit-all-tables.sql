-- Run this whole file in the Supabase SQL editor and send me the results
-- (or just the row counts). It tells us, table by table, which workspaces
-- still have empty or leftover placeholder data and need a real import.

select 'customers' as table_name, count(*) from public.customers
union all select 'suppliers', count(*) from public.suppliers
union all select 'employees', count(*) from public.employees
union all select 'machines', count(*) from public.machines
union all select 'raw_materials', count(*) from public.raw_materials
union all select 'job_orders', count(*) from public.job_orders
union all select 'projects', count(*) from public.projects
union all select 'crm_accounts', count(*) from public.crm_accounts
union all select 'quotes', count(*) from public.quotes
union all select 'contracts', count(*) from public.contracts
union all select 'work_orders', count(*) from public.work_orders
union all select 'installation_sites', count(*) from public.installation_sites
union all select 'inventory_skus', count(*) from public.inventory_skus
union all select 'purchase_orders', count(*) from public.purchase_orders
union all select 'compliance_findings', count(*) from public.compliance_findings
union all select 'maintenance_events', count(*) from public.maintenance_events
union all select 'lessons_learned', count(*) from public.lessons_learned
union all select 'sops', count(*) from public.sops
union all select 'drawings', count(*) from public.drawings
order by table_name;

-- Then, to actually see whether the rows are real or placeholder, spot-check
-- a few tables at a time by name — uncomment the ones you want to look at:

-- select id, name, category, on_time, status_label from public.suppliers order by name limit 20;
-- select id, name, status_label from public.machines order by name limit 20;
-- select id, name, status_label from public.raw_materials order by name limit 20;
-- select id, name from public.crm_accounts order by name limit 20;
-- select id, number, customer, value, status_label from public.quotes order by number limit 20;
-- select id, customer, type, value, status_label from public.contracts order by customer limit 20;
-- select id, title, meta from public.work_orders order by title limit 20;
-- select id, site, customer, status_label from public.installation_sites order by site limit 20;
-- select id, code, name, stock, status_label from public.inventory_skus order by code limit 20;
-- select id, title, meta from public.purchase_orders order by title limit 20;
-- select id, item, area, status_label from public.compliance_findings order by item limit 20;
