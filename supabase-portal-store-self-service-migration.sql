-- One-time migration: customer self-service store address/GSTIN edits
-- (with a full revision history) + freezing each order's delivery address
-- at the moment it's placed. Run once in the Supabase SQL Editor. Safe to
-- re-run (every statement is idempotent).
--
-- Context: two real gaps found testing the portal --
--   1. Only MMDI staff could ever fix a store's missing address/GSTIN
--      (CompaniesTab). A customer whose store was blocked from ordering
--      had no way to fix it themselves except emailing MMDI -- this
--      migration lets the customer who owns that store edit it directly,
--      with every change (by either side) kept in a real history table
--      instead of just being silently overwritten.
--   2. portal_orders had no address of its own at all -- OrderDetailClient
--      showed whatever portal_company_stores.address currently says, live.
--      If a store's address changes later (by either the customer's new
--      self-edit or a staff edit), every one of that store's *past* orders
--      would silently show the new address too, which is wrong -- an order
--      already placed shipped against the address that was current when it
--      was placed, and must keep showing that, not a moving target.

-- 1. Freeze each order's delivery details at the moment it's placed.
alter table public.portal_orders add column if not exists delivery_address text;
alter table public.portal_orders add column if not exists delivery_city text;
alter table public.portal_orders add column if not exists delivery_gstin text;

-- One-time backfill for orders placed before this migration -- the best
-- available answer (the store's current address) since no order-level
-- value existed to snapshot at the time. Only fills rows that don't have a
-- value yet, so it's safe to re-run and won't clobber anything the app has
-- since written.
update public.portal_orders o
set
  delivery_address = s.address,
  delivery_city = s.city,
  delivery_gstin = s.gstin
from public.portal_company_stores s
where s.id = o.store_id and o.delivery_address is null;

-- Same tool used for payment_status/razorpay_payment_id/paid_at in
-- supabase-portal-checkout-migration.sql, for the same reason: this needs
-- to be "nobody using the authenticated role can ever write this column
-- after the row exists", which RLS's WITH CHECK can't express (no old-vs-
-- new comparison in one expression) but a column-level REVOKE can. The
-- order-creation route still sets these three at INSERT time (a REVOKE on
-- UPDATE has no effect on INSERT) -- only later modification is blocked.
revoke update (delivery_address, delivery_city, delivery_gstin) on public.portal_orders from authenticated;

-- 2. Revision history for store address/city/GSTIN changes.
create table if not exists public.portal_store_address_history (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.portal_company_stores(id) on delete cascade,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id),
  changed_by_role text check (changed_by_role in ('customer', 'staff')),
  old_address text,
  new_address text,
  old_city text,
  new_city text,
  old_gstin text,
  new_gstin text
);

create index if not exists portal_store_address_history_store_idx
  on public.portal_store_address_history(store_id, changed_at desc);

alter table public.portal_store_address_history enable row level security;

drop policy if exists portal_store_address_history_select on public.portal_store_address_history;
create policy portal_store_address_history_select on public.portal_store_address_history
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (
      select 1 from public.portal_company_stores s
      where s.id = store_id and s.company_id = public.portal_company_id()
    )
  );
-- Deliberately no insert/update/delete policy for `authenticated` -- the
-- only writer is the trigger below, which runs security definer (as the
-- function owner, which bypasses RLS) so history can't be inserted,
-- edited, or deleted by any client directly, staff or customer.

-- 3. Auto-log every address/city/gstin change on portal_company_stores,
--    regardless of which path made it (this trigger, not the app code, so
--    a future third edit path can't accidentally skip logging).
create or replace function public.portal_store_address_history_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.address is distinct from old.address
     or new.city is distinct from old.city
     or new.gstin is distinct from old.gstin
  then
    insert into public.portal_store_address_history (
      store_id, changed_by, changed_by_role,
      old_address, new_address, old_city, new_city, old_gstin, new_gstin
    ) values (
      new.id, auth.uid(), case when public.is_portal_user() then 'customer' else 'staff' end,
      old.address, new.address, old.city, new.city, old.gstin, new.gstin
    );
  end if;
  return new;
end;
$$;

drop trigger if exists portal_store_address_history_trg on public.portal_company_stores;
create trigger portal_store_address_history_trg
  after update on public.portal_company_stores
  for each row execute function public.portal_store_address_history_log();

-- 4. Let a portal customer update their own company's stores -- but ONLY
--    address/city/gstin, never store_name/active/company_id/lfg_sfo_id.
--    RLS's WITH CHECK can only see the new row, not which columns actually
--    changed, so it can't express "these columns, and only these columns"
--    on its own (same limitation as the payment-column problem above) --
--    a BEFORE UPDATE trigger comparing OLD and NEW is the right tool here,
--    same conclusion as item 1, applied to a different table.
drop policy if exists portal_stores_update_customer on public.portal_company_stores;
create policy portal_stores_update_customer on public.portal_company_stores
  for update to authenticated
  using (company_id = public.portal_company_id())
  with check (company_id = public.portal_company_id());

create or replace function public.portal_company_stores_guard_customer_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_portal_user() then
    if new.company_id is distinct from old.company_id
      or new.store_name is distinct from old.store_name
      or new.active is distinct from old.active
      or new.lfg_sfo_id is distinct from old.lfg_sfo_id
    then
      raise exception 'Customers may only update a store''s address, city, and GSTIN.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists portal_company_stores_guard_customer_update_trg on public.portal_company_stores;
create trigger portal_company_stores_guard_customer_update_trg
  before update on public.portal_company_stores
  for each row execute function public.portal_company_stores_guard_customer_update();
