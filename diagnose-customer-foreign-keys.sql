-- Find EVERY foreign key in the database that points at public.customers,
-- so the bulk-delete cleanup can be made bulletproof instead of failing
-- one constraint at a time (as sales_transactions_customer_id_fkey just
-- did). Several tables that reference customers (customer_contacts,
-- customer_comments, customer_approvals, sales_transactions) predate this
-- repo's convention of committing schema files, so this is the only
-- reliable way to see all of them, not just the ones I can grep for.

select
  tc.table_name as referencing_table,
  kcu.column_name as referencing_column,
  tc.constraint_name,
  rc.delete_rule -- CASCADE means deleting the customer auto-deletes these rows too; NO ACTION/RESTRICT means it blocks the delete (like sales_transactions just did)
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
join information_schema.referential_constraints rc
  on rc.constraint_name = tc.constraint_name and rc.constraint_schema = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY'
  and ccu.table_name = 'customers'
  and ccu.table_schema = 'public'
order by tc.table_name;

-- Also: exactly which of the "not in master" customers actually have real
-- activity anywhere (the id from the error, d875bff2-..., plus any
-- others) -- run this AFTER the query above tells you the real table
-- list; I'll build the final exclusion list from both results together.
