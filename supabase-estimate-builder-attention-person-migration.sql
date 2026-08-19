-- MMDI ONE — Estimate Builder: attention person per billing site
-- Run AFTER supabase-estimate-builder-schema.sql +
-- supabase-estimate-builder-fields-migration.sql.
--
-- Adds customer_sites.attention_person (the "Attn:" contact at that
-- store/office) and backfills it for all 10 IKEA sites from the names the
-- user supplied. The Estimate Builder auto-fills the "Attention person"
-- header field from this the moment a billing site is picked — still
-- editable per estimate afterwards, this is just the sensible default.
--
-- Idempotent: safe to re-run.

alter table public.customer_sites add column if not exists attention_person text;

update public.customer_sites cs
set attention_person = v.attention_person
from (values
  ('Delhi Pacific Mall', 'Mr. Sami Marzougui'),
  ('DLF Avenue, Saket, New Delhi', 'Mr. Mohd Saif Khan'),
  ('Hyderabad Store', 'Mr. Sai Suraj'),
  ('Hyderabad Sales Office', 'Mr. Meeravali Konapally'),
  ('INGKA Centre Delhi', 'Ms. Seema Agrawal'),
  ('INGKA SERVICES LLP Bangalore', 'Ms. Namita Varahamurthy'),
  ('IKEA Bangalore Store', 'Mr. Sidharth'),
  ('IKEA Navi Mumbai Store', 'Ms. Jaya Sravani'),
  ('IKEA Pune PMC', 'Ms. Kejal Mistry'),
  ('IKEA Worli', 'Ms. Riya Patil')
) as v(site_name, attention_person)
where cs.site_name = v.site_name
  and cs.customer_id in (select id from public.customers where name ilike '%IKEA%');

-- Verify — should return all 10 with a name filled in:
-- select site_name, attention_person from public.customer_sites cs
-- join public.customers c on c.id = cs.customer_id where c.name ilike '%IKEA%';
