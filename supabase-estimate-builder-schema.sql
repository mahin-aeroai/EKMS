-- MMDI ONE — Estimate Builder (customer sites + estimates + line items)
-- Run this in the Supabase SQL Editor (Project: mahin-aeroai's Project,
-- https://vzyrvzgtjcodxkjydxxn.supabase.co), after the role-based RLS
-- migration (supabase-role-based-rls-migration.sql) has already been run —
-- this file's policies call public.user_role(), defined there.
--
-- WHAT THIS ADDS
-- 1. public.customer_sites — billing/ship-to addresses for a customer. One
--    customer + one contract can have many sites (e.g. IKEA's stores below
--    all share ONE contract but each has its own registered address/GSTIN).
-- 2. public.estimates — the estimate/quote header: which customer, which
--    contract, which site, GST%, and the rolled-up totals.
-- 3. public.estimate_line_items — one row per product line on an estimate.
--    Each line snapshots product name/description/uom/rate at the time it
--    was added (so an estimate stays accurate even if the source rate card
--    changes later) and flags itself is_contract_item = false when it's a
--    "non-contract / unlisted product" the user typed in manually instead
--    of picking from a rate card.
--
-- DESIGN DECISIONS (from the user's answers when this was scoped):
-- - GST: a single flat gst_percent field on the estimate (not a CGST/SGST/
--   IGST split) — applied to (subtotal + transportation + installation).
-- - Transportation & installation: entered PER LINE ITEM (transportation_
--   rate / installation_rate columns on estimate_line_items), not as one
--   flat amount for the whole estimate. Each is a flat amount for that
--   line (not multiplied by quantity) — matches "per site/job", not
--   "per unit". Easy to change to qty-multiplied later if that's wrong.
-- - quote_number: PLACEHOLDER scheme for now (<CUSTOMER_CODE>-EST-0001,
--   incrementing per customer) — the user said they'd supply the real
--   numbering series separately; swap generate_quote_number() below once
--   that arrives.
--
-- Idempotent: safe to re-run.

-- ============================================================
-- STEP 1 — customer_sites
-- ============================================================

create table if not exists public.customer_sites (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  site_name text not null,
  legal_entity_name text,
  address text not null,
  gstin text,
  created_at timestamptz not null default now(),
  unique (customer_id, site_name)
);

-- ============================================================
-- STEP 2 — estimates (header)
-- ============================================================

create table if not exists public.estimates (
  id uuid primary key default gen_random_uuid(),
  quote_number text unique,
  customer_id uuid not null references public.customers(id),
  contract_id uuid references public.contracts(id),
  site_id uuid references public.customer_sites(id),
  status text not null default 'draft' check (status in ('draft', 'sent', 'won', 'lost')),
  gst_percent numeric not null default 18,
  subtotal numeric not null default 0,
  transportation_total numeric not null default 0,
  installation_total numeric not null default 0,
  taxable_total numeric not null default 0,
  gst_amount numeric not null default 0,
  grand_total numeric not null default 0,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- STEP 3 — estimate_line_items
-- ============================================================

create table if not exists public.estimate_line_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  sort_order int not null default 0,
  is_contract_item boolean not null default true,
  rate_card_source text, -- e.g. 'ikea_rate_card', null for a manually-typed non-contract line
  product_name text not null,
  description text,
  additional_description text,
  uom text,
  unit_rate numeric not null default 0,
  quantity numeric not null default 1,
  transportation_rate numeric not null default 0,
  installation_rate numeric not null default 0,
  line_subtotal numeric not null default 0,
  line_total numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists estimate_line_items_estimate_id_idx on public.estimate_line_items(estimate_id);
create index if not exists customer_sites_customer_id_idx on public.customer_sites(customer_id);

-- ============================================================
-- STEP 4 — placeholder quote-number generator
-- ============================================================
-- <CODE>-EST-0001, incrementing per customer code. Replace the body once
-- the real numbering series is provided — every call site is the single
-- INSERT in the Estimate Builder page, so swapping this function alone is
-- enough to change the scheme app-wide.

create or replace function public.generate_quote_number(p_customer_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_seq int;
begin
  select count(*) + 1 into next_seq
  from public.estimates e
  join public.customers c on c.id = e.customer_id
  where c.code = p_customer_code;

  return upper(p_customer_code) || '-EST-' || lpad(next_seq::text, 4, '0');
end;
$$;

-- ============================================================
-- STEP 5 — group-access function (defensive create-or-replace: matches
-- supabase-module-access-migration.sql's semantics whether or not that
-- file has actually been run yet in this project)
-- ============================================================

alter table public.profiles add column if not exists allowed_groups text[];

create or replace function public.user_has_group_access(required_groups text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()) = 'admin'
    or (select allowed_groups from public.profiles where id = auth.uid()) is null
    or (select allowed_groups from public.profiles where id = auth.uid()) && required_groups,
    false
  )
$$;

-- ============================================================
-- STEP 6 — RLS: role-aware AND group-scoped to ['customers', 'finance'],
-- same groups as contracts/sales_transactions (this data is customer +
-- finance-facing, same as those two).
-- ============================================================

alter table public.customer_sites enable row level security;
alter table public.estimates enable row level security;
alter table public.estimate_line_items enable row level security;

drop policy if exists customer_sites_select on public.customer_sites;
drop policy if exists customer_sites_insert on public.customer_sites;
drop policy if exists customer_sites_update on public.customer_sites;
drop policy if exists customer_sites_delete on public.customer_sites;

create policy customer_sites_select on public.customer_sites
  for select to authenticated
  using (public.user_role() in ('admin', 'editor', 'viewer') and public.user_has_group_access(array['customers', 'finance']));

create policy customer_sites_insert on public.customer_sites
  for insert to authenticated
  with check (public.user_role() in ('admin', 'editor') and public.user_has_group_access(array['customers', 'finance']));

create policy customer_sites_update on public.customer_sites
  for update to authenticated
  using (public.user_role() in ('admin', 'editor') and public.user_has_group_access(array['customers', 'finance']))
  with check (public.user_role() in ('admin', 'editor') and public.user_has_group_access(array['customers', 'finance']));

create policy customer_sites_delete on public.customer_sites
  for delete to authenticated
  using (public.user_role() = 'admin');

drop policy if exists estimates_select on public.estimates;
drop policy if exists estimates_insert on public.estimates;
drop policy if exists estimates_update on public.estimates;
drop policy if exists estimates_delete on public.estimates;

create policy estimates_select on public.estimates
  for select to authenticated
  using (public.user_role() in ('admin', 'editor', 'viewer') and public.user_has_group_access(array['customers', 'finance']));

create policy estimates_insert on public.estimates
  for insert to authenticated
  with check (public.user_role() in ('admin', 'editor') and public.user_has_group_access(array['customers', 'finance']));

create policy estimates_update on public.estimates
  for update to authenticated
  using (public.user_role() in ('admin', 'editor') and public.user_has_group_access(array['customers', 'finance']))
  with check (public.user_role() in ('admin', 'editor') and public.user_has_group_access(array['customers', 'finance']));

create policy estimates_delete on public.estimates
  for delete to authenticated
  using (public.user_role() = 'admin');

drop policy if exists estimate_line_items_select on public.estimate_line_items;
drop policy if exists estimate_line_items_insert on public.estimate_line_items;
drop policy if exists estimate_line_items_update on public.estimate_line_items;
drop policy if exists estimate_line_items_delete on public.estimate_line_items;

create policy estimate_line_items_select on public.estimate_line_items
  for select to authenticated
  using (public.user_role() in ('admin', 'editor', 'viewer') and public.user_has_group_access(array['customers', 'finance']));

create policy estimate_line_items_insert on public.estimate_line_items
  for insert to authenticated
  with check (public.user_role() in ('admin', 'editor') and public.user_has_group_access(array['customers', 'finance']));

create policy estimate_line_items_update on public.estimate_line_items
  for update to authenticated
  using (public.user_role() in ('admin', 'editor') and public.user_has_group_access(array['customers', 'finance']))
  with check (public.user_role() in ('admin', 'editor') and public.user_has_group_access(array['customers', 'finance']));

create policy estimate_line_items_delete on public.estimate_line_items
  for delete to authenticated
  using (public.user_role() = 'admin');

-- ============================================================
-- STEP 7 — IKEA customer + its 10 sites (billing addresses)
-- ============================================================
-- All 10 share the ONE existing IKEA contract (see public.contracts,
-- customer = 'IKEA India') — only the billing address/legal entity/GSTIN
-- differs per store. If no customers row matching '%IKEA%' exists yet,
-- one is created here so the seed always has a customer_id to attach to.

do $$
declare
  v_customer_id uuid;
begin
  select id into v_customer_id from public.customers where name ilike '%IKEA%' limit 1;

  if v_customer_id is null then
    insert into public.customers (code, name, region, tier, payment_terms, account_owner, status, lifetime_value, open_orders, on_time_delivery, health_score, tags)
    values ('IKEA', 'IKEA India', 'North', null, null, null, 'active', 0, 0, 0, 0, array[]::text[])
    returning id into v_customer_id;
  end if;

  insert into public.customer_sites (customer_id, site_name, legal_entity_name, address, gstin) values
    (v_customer_id, 'Delhi Pacific Mall', 'IKEA INDIA PRIVATE LIMITED',
      'Shop No. SH/LGF/21, Pacific Development Corporate Ltd, Najafgarh Rd, Tagore Garden, NEW DELHI-110018',
      '07AADC13006N1ZM'),
    (v_customer_id, 'DLF Avenue, Saket, New Delhi', 'IKEA INDIA PRIVATE LIMITED',
      'M-01 to M-06 & M-101 A, 284 A-E, Ground & First Floor, DLF Avenue, A-4, District Centre, Press Enclave Road, Saket District Centre, New Delhi-110017',
      '07AADCI3006N1ZM'),
    (v_customer_id, 'Hyderabad Store', 'IKEA India Private Ltd',
      'Plot No 25, 26, & 29, Raidurg Village, Serilingampally Mandal, Rangareddy District, Hyderabad, 500081 INDIA',
      null),
    (v_customer_id, 'Hyderabad Sales Office', 'IKEA India Private Ltd',
      'Plot No 25, 26, & 29, Raidurg Village, Serilingampally Mandal, Rangareddy District, Hyderabad, 500081 INDIA',
      null),
    (v_customer_id, 'INGKA Centre Delhi', 'INGKA CENTRES INDIA PRIVATE LIMITED',
      'E-01, Sector-51, Noida, Gautam Buddha Nagar, Uttar Pradesh, 201301',
      '09AAFCI0711E1Z1'),
    (v_customer_id, 'INGKA SERVICES LLP Bangalore', 'INGKA SERVICES LLP',
      '6th Floor, Hub 4, Building No. 92/1, 101/1 and 95/2, SEZ Building, Nagavara Karle Town Centre, Bangalore, Karnataka 560045 INDIA',
      '29AAIFI0033K1ZE'),
    (v_customer_id, 'IKEA Bangalore Store', 'IKEA India Private Ltd',
      'Survey No.12 and 13, Behind Nagasandra Metro Station, Nagasandra Village, Yeshwanthapur, Hobli, Bengaluru, Karnataka 560073 INDIA',
      null),
    (v_customer_id, 'IKEA Navi Mumbai Store', 'IKEA India Private Ltd',
      'Plot 15-15A-C Vill-Turbhe and Pawana Mumbai Store Land, MIDC TTC Industrial Area, IN 400705 Navi Mumbai',
      null),
    (v_customer_id, 'IKEA Pune PMC', 'IKEA INDIA PRIVATE LIMITED',
      'Unit No. G-01, Lower Ground Floor, Phoenix MarketCity Pune, Survey No 207, Viman Nagar Road, Pune, Maharashtra- 411014',
      '27AADCI3006N1ZK'),
    (v_customer_id, 'IKEA Worli', 'IKEA India Private Ltd',
      '#465, Trade View, Utopia City, Pandurang Lower Parel, Worli, Mumbai – 400013 INDIA',
      null)
  on conflict (customer_id, site_name) do nothing;
end $$;

-- ============================================================
-- Verification queries — run after the block above
-- ============================================================

-- Should return 10 rows, all under the same customer_id:
-- select site_name, legal_entity_name, gstin from public.customer_sites cs
-- join public.customers c on c.id = cs.customer_id where c.name ilike '%IKEA%';

-- NOTE: Delhi Pacific Mall's GSTIN ('07AADC13006N1ZM') differs from DLF
-- Avenue's ('07AADCI3006N1ZM') by one character (digit 1 vs letter I) —
-- transcribed exactly as given; both are state code 07 (Delhi) for the
-- same legal entity, so this is very likely a typo in the source and
-- worth double-checking against the actual GST certificate before this
-- is used on a real invoice.
