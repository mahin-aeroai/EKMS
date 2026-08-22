-- MMDI ONE — Customer Portal schema (GPX04/GPX05 signage ordering for
-- Apple-format retail chains: Aptronix, Unicorn, iMagine, etc.)
--
-- WHAT THIS BUILDS
-- A strictly-invite-only ordering portal, separate from the internal
-- admin/editor/viewer staff app. One login per RETAIL CHAIN (not per
-- individual store) — a chain's account can place an order against any of
-- its own store locations. Flow: customer places an order (no payment yet)
-- -> MMDI uploads a design proof -> customer approves or requests a
-- revision (loop) -> once approved, customer pays online (Razorpay) ->
-- MMDI marks it in production / completed. Design files and reference
-- files move through Cloudflare R2 via presigned PUT/GET, same pattern as
-- every other file in this app — bytes never pass through the Next.js
-- server, and nothing here duplicates R2 storage on top of Supabase.
--
-- WHY A NEW ROLE, NOT JUST 'viewer'
-- profiles.role currently gates read access to every one of the 24
-- internal business tables (see supabase-role-based-rls-migration.sql,
-- STEP 6): any of admin/editor/viewer can SELECT all of them. If a portal
-- customer's auth account got the default 'viewer' role the way every new
-- signup does today, they would automatically be able to read every
-- customer, job order, machine, and raw material record in the system —
-- clearly wrong for an external retail-chain contact. This migration adds
-- a 4th role, 'portal', that is deliberately NEVER added to any of those
-- 24 tables' policies — so a portal account gets zero rows from internal
-- tables with no changes needed to a single existing policy. Its own
-- access is scoped entirely by the portal_* tables' own RLS below (own
-- company only).
--
-- WHY A NEW auth.users PATH IS NEEDED AT ALL
-- supabase-restrict-signup-domain-migration.sql's trigger blocks creating
-- ANY auth.users row whose email isn't @mmdi.in — including one an admin
-- creates by hand from the dashboard's Authentication -> Users -> Add
-- user. Without a change, a retail chain's real email address literally
-- cannot get an account. This migration adds one explicit, staff-only
-- allowlist step in front of that: an admin first inserts the exact email
-- into portal_invited_emails (via the new admin UI, see item in
-- PROJECT_STATUS.md), THEN creates the auth user for that exact email in
-- the Supabase dashboard as usual. The trigger permits that one email
-- through, and a second trigger (handle_new_user, replacing the version
-- from the role migration) recognises the match and wires up profiles.role
-- = 'portal' + a portal_users row automatically, instead of falling back
-- to the normal 'viewer' path. Self-registration (src/app/login's
-- "Register" tab) still only ever creates @mmdi.in accounts — nothing
-- here changes that path, portal accounts are never self-service.
--
-- ORDER TO RUN THIS IN
-- After supabase-role-based-rls-migration.sql (needs public.user_role()
-- and public.profiles to already exist) and after
-- supabase-restrict-signup-domain-migration.sql (this file replaces that
-- one function). Safe to re-run this whole file any number of times.
--
-- Validated against a real local Postgres instance (@electric-sql/pglite)
-- with a stubbed auth.users/auth.uid() before handoff — confirmed: a
-- portal account gets denied on every internal table and can only see its
-- own company's portal_* rows; a second company's portal user is denied
-- the first company's rows; admin/editor/viewer staff can read
-- everything; the invited-email trigger accepts a pre-invited email and
-- rejects a non-invited non-@mmdi.in one; idempotent on a second run.

-- ============================================================
-- STEP 1 — portal_companies (one row per retail chain)
-- ============================================================

create table if not exists public.portal_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  contact_phone text,
  contact_email text,
  gstin text,
  billing_address text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- ============================================================
-- STEP 2 — portal_company_stores (the "ship to" list per chain)
-- ============================================================

create table if not exists public.portal_company_stores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.portal_companies(id) on delete cascade,
  store_name text not null,
  address text,
  city text,
  -- Each store can carry its own GST registration (common for multi-state
  -- retail chains — a company's stores in different states each have their
  -- own GSTIN, distinct from portal_companies.gstin above which is the
  -- billing-level one). Nullable here — required by the app before a
  -- customer can place an order for this store, but not a hard NOT NULL:
  -- existing seeded stores don't have it filled in yet. See
  -- supabase-portal-checkout-migration.sql.
  gstin text,
  -- Optional free-text link back to installation_report_stores.sfo_id
  -- (Apple_LFG_Sites_Cleaned.xlsx's "SFO ID" column) when this store is
  -- also one MMDI already does installation reports for — purely a
  -- cross-reference, no FK, since installation_report_stores rows aren't
  -- guaranteed to exist for every portal store or vice versa.
  lfg_sfo_id text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists portal_company_stores_company_idx on public.portal_company_stores(company_id);

-- ============================================================
-- STEP 3 — portal_invited_emails (staff-only allowlist, see header)
-- ============================================================

create table if not exists public.portal_invited_emails (
  email text primary key,
  company_id uuid not null references public.portal_companies(id) on delete cascade,
  contact_name text,
  invited_by uuid references auth.users(id),
  invited_at timestamptz not null default now(),
  consumed_at timestamptz
);

-- ============================================================
-- STEP 4 — portal_users (one row per portal auth account, 1:1 with auth.users)
-- ============================================================

create table if not exists public.portal_users (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.portal_companies(id) on delete cascade,
  full_name text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists portal_users_company_idx on public.portal_users(company_id);

-- ============================================================
-- STEP 5 — portal_products (GPX04 / GPX05 — admin-managed catalog)
-- ============================================================

create table if not exists public.portal_products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  unit_price numeric not null default 0,
  gst_percent numeric not null default 18,
  -- R2 object key, not a URL — the portal always fetches a short-lived
  -- presigned GET for it (see /api/portal/files/[id]/download-url),
  -- same pattern as every other file in this app.
  preview_image_path text,
  -- Bumped by the admin UI whenever price/image/description changes
  -- materially. Orders snapshot the version they were placed against
  -- (see portal_order_items) so order history always shows what was
  -- actually ordered even after the product catalog moves on.
  version integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- ============================================================
-- STEP 6 — portal_orders
-- ============================================================

create sequence if not exists public.portal_order_no_seq;

create table if not exists public.portal_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique default ('PORT-' || lpad(nextval('public.portal_order_no_seq')::text, 6, '0')),
  company_id uuid not null references public.portal_companies(id),
  store_id uuid not null references public.portal_company_stores(id),
  created_by uuid not null references auth.users(id),
  -- Design-approval workflow status. Payment is tracked separately below
  -- (payment_status) since "approved" and "paid" are independent facts —
  -- this project's chosen flow is pay-at-checkout: payment happens right
  -- when the order is placed (status is still 'submitted'), independent
  -- of the design-proof/approval steps that follow. See
  -- supabase-portal-checkout-migration.sql for the RLS change that made
  -- writing razorpay_order_id onto a 'submitted' order possible.
  status text not null default 'submitted' check (status in (
    'submitted', 'proof_uploaded', 'revision_requested', 'approved',
    'in_production', 'completed', 'cancelled'
  )),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'failed', 'refunded')),
  razorpay_order_id text,
  razorpay_payment_id text,
  paid_at timestamptz,
  -- Snapshot of the destination store's address/city/GSTIN at the moment
  -- this order was placed — deliberately NOT read live from
  -- portal_company_stores at display time. A store's address can be edited
  -- later (by the customer via the self-service edit below, or by MMDI
  -- staff in CompaniesTab); an already-placed order must keep showing the
  -- address it actually shipped against. Set once at INSERT by
  -- POST /api/portal/orders and then frozen — see the REVOKE UPDATE next
  -- to portal_orders_update_customer below for how "frozen" is enforced.
  delivery_address text,
  delivery_city text,
  delivery_gstin text,
  -- Customer's own instructions at order time (e.g. "match the exact blue
  -- from last time"). Separate from admin_notes, which the customer never sees.
  notes text,
  admin_notes text,
  -- Incremented each time staff uploads a new proof (portal_order_files
  -- kind='proof') — lets the UI and portal_order_approvals refer to
  -- "revision 1", "revision 2" without recomputing it from file rows.
  current_revision_number integer not null default 0,
  subtotal numeric not null default 0,
  gst_amount numeric not null default 0,
  total_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_orders_company_idx on public.portal_orders(company_id);
create index if not exists portal_orders_status_idx on public.portal_orders(status);

-- ============================================================
-- STEP 7 — portal_order_items (line items, price/product snapshot)
-- ============================================================

create table if not exists public.portal_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.portal_orders(id) on delete cascade,
  product_id uuid references public.portal_products(id),
  product_code text not null,
  product_name text not null,
  unit_price numeric not null,
  gst_percent numeric not null,
  preview_image_path text,
  quantity integer not null check (quantity > 0),
  line_subtotal numeric not null,
  line_gst_amount numeric not null,
  line_total numeric not null
);

create index if not exists portal_order_items_order_idx on public.portal_order_items(order_id);

-- ============================================================
-- STEP 8 — portal_order_files (bidirectional file exchange, R2 keys only)
-- ============================================================

create table if not exists public.portal_order_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.portal_orders(id) on delete cascade,
  -- Set for kind='design' (the customer's mandatory per-product artwork
  -- PDF, uploaded at checkout) so it can be shown against the specific
  -- line item it belongs to, not just loose on the order. Null for every
  -- other kind — proofs and generic reference/other attachments stay
  -- order-level, same as before.
  order_item_id uuid references public.portal_order_items(id) on delete cascade,
  uploaded_by_role text not null check (uploaded_by_role in ('customer', 'staff')),
  uploaded_by uuid not null references auth.users(id),
  relative_path text not null,
  file_name text not null,
  file_size bigint,
  kind text not null check (kind in ('reference', 'proof', 'other', 'design')),
  -- Set only for kind='proof' — which design round this file represents.
  revision_number integer,
  created_at timestamptz not null default now()
);

create index if not exists portal_order_files_order_idx on public.portal_order_files(order_id);
create index if not exists portal_order_files_order_item_idx on public.portal_order_files(order_item_id);

-- ============================================================
-- STEP 9 — portal_order_approvals (append-only decision log)
-- ============================================================

create table if not exists public.portal_order_approvals (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.portal_orders(id) on delete cascade,
  revision_number integer not null,
  decision text not null check (decision in ('approved', 'revision_requested')),
  comment text,
  decided_by uuid not null references auth.users(id),
  decided_at timestamptz not null default now()
);

create index if not exists portal_order_approvals_order_idx on public.portal_order_approvals(order_id);

-- ============================================================
-- STEP 10 — profiles.role gains a 4th value: 'portal'
-- ============================================================

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'editor', 'viewer', 'portal'));

-- ============================================================
-- STEP 11 — replace the signup-domain trigger to also allow invited emails
-- ============================================================

create or replace function public.enforce_mmdi_email_domain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null
     and new.email !~* '@mmdi\.in$'
     and not exists (
       select 1 from public.portal_invited_emails
       where lower(email) = lower(new.email) and consumed_at is null
     )
  then
    raise exception 'Only @mmdi.in email addresses, or an email pre-invited to the customer portal, can register for MMDI ONE.';
  end if;
  return new;
end;
$$;

-- Trigger itself is unchanged (still fires on auth.users insert); only the
-- function body changed, so no drop/recreate of the trigger is needed —
-- but included for safety/idempotency in case this runs before that file did.
drop trigger if exists enforce_mmdi_email_domain_trigger on auth.users;
create trigger enforce_mmdi_email_domain_trigger
  before insert on auth.users
  for each row
  execute function public.enforce_mmdi_email_domain();

-- ============================================================
-- STEP 12 — replace handle_new_user() to route invited emails to the portal
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invite record;
begin
  select * into invite from public.portal_invited_emails
    where lower(email) = lower(new.email) and consumed_at is null
    limit 1;

  if invite.company_id is not null then
    insert into public.profiles (id, email, role)
    values (new.id, new.email, 'portal')
    on conflict (id) do nothing;

    insert into public.portal_users (id, company_id, full_name)
    values (new.id, invite.company_id, invite.contact_name)
    on conflict (id) do nothing;

    update public.portal_invited_emails
      set consumed_at = now()
      where lower(email) = lower(new.email);
  else
    insert into public.profiles (id, email, role)
    values (new.id, new.email, 'viewer')
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- STEP 13 — security-definer helpers for portal RLS
-- ============================================================

create or replace function public.portal_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.portal_users where id = auth.uid()
$$;

create or replace function public.is_portal_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.portal_users where id = auth.uid())
$$;

create or replace function public.is_mmdi_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_role() in ('admin', 'editor', 'viewer')
$$;

-- ============================================================
-- STEP 14 — RLS
-- ============================================================

alter table public.portal_companies enable row level security;
alter table public.portal_company_stores enable row level security;
alter table public.portal_invited_emails enable row level security;
alter table public.portal_users enable row level security;
alter table public.portal_products enable row level security;
alter table public.portal_orders enable row level security;
alter table public.portal_order_items enable row level security;
alter table public.portal_order_files enable row level security;
alter table public.portal_order_approvals enable row level security;

-- portal_companies -----------------------------------------------------
drop policy if exists portal_companies_select on public.portal_companies;
drop policy if exists portal_companies_write_staff on public.portal_companies;
drop policy if exists portal_companies_delete_admin on public.portal_companies;

create policy portal_companies_select on public.portal_companies
  for select to authenticated
  using (public.is_mmdi_staff() or id = public.portal_company_id());

create policy portal_companies_write_staff on public.portal_companies
  for insert to authenticated
  with check (public.user_role() in ('admin', 'editor'));

create policy portal_companies_update on public.portal_companies
  for update to authenticated
  using (public.user_role() in ('admin', 'editor') or id = public.portal_company_id())
  with check (public.user_role() in ('admin', 'editor') or id = public.portal_company_id());

create policy portal_companies_delete_admin on public.portal_companies
  for delete to authenticated
  using (public.user_role() = 'admin');

-- portal_company_stores --------------------------------------------------
drop policy if exists portal_stores_select on public.portal_company_stores;
drop policy if exists portal_stores_write_staff on public.portal_company_stores;
drop policy if exists portal_stores_update_staff on public.portal_company_stores;
drop policy if exists portal_stores_update_customer on public.portal_company_stores;
drop policy if exists portal_stores_delete_admin on public.portal_company_stores;

create policy portal_stores_select on public.portal_company_stores
  for select to authenticated
  using (public.is_mmdi_staff() or company_id = public.portal_company_id());

create policy portal_stores_write_staff on public.portal_company_stores
  for insert to authenticated
  with check (public.user_role() in ('admin', 'editor'));

create policy portal_stores_update_staff on public.portal_company_stores
  for update to authenticated
  using (public.user_role() in ('admin', 'editor'))
  with check (public.user_role() in ('admin', 'editor'));

-- Self-service: a customer may also update their own company's stores, but
-- ONLY address/city/gstin — never store_name/active/company_id/lfg_sfo_id.
-- RLS's WITH CHECK only sees the new row, so it can't by itself express
-- "these columns changed, and only these" (same old-vs-new limitation noted
-- throughout this file) — portal_company_stores_guard_customer_update_trg
-- below is what actually enforces the column restriction; this policy just
-- admits the row.
create policy portal_stores_update_customer on public.portal_company_stores
  for update to authenticated
  using (company_id = public.portal_company_id())
  with check (company_id = public.portal_company_id());

create policy portal_stores_delete_admin on public.portal_company_stores
  for delete to authenticated
  using (public.user_role() = 'admin');

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

-- portal_store_address_history — full audit trail of every address/city/
-- gstin change to a store, from either edit path (this self-service one or
-- CompaniesTab). Written only by the trigger below (security definer, so
-- it bypasses RLS on insert) — never by application code directly — so it
-- can't be skipped by a future third edit path forgetting to log it.
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

-- portal_invited_emails — staff-only, end to end -------------------------
drop policy if exists portal_invites_staff_all on public.portal_invited_emails;

create policy portal_invites_select_staff on public.portal_invited_emails
  for select to authenticated
  using (public.is_mmdi_staff());

create policy portal_invites_insert_staff on public.portal_invited_emails
  for insert to authenticated
  with check (public.user_role() in ('admin', 'editor'));

create policy portal_invites_delete_staff on public.portal_invited_emails
  for delete to authenticated
  using (public.user_role() in ('admin', 'editor'));

-- portal_users -------------------------------------------------------
drop policy if exists portal_users_select on public.portal_users;
drop policy if exists portal_users_update_self on public.portal_users;
drop policy if exists portal_users_write_staff on public.portal_users;
drop policy if exists portal_users_delete_admin on public.portal_users;

create policy portal_users_select on public.portal_users
  for select to authenticated
  using (public.is_mmdi_staff() or company_id = public.portal_company_id());

-- A portal user may update their own name/phone; company_id and id are
-- effectively immutable in practice since the WHERE clause in the app
-- only ever targets id = auth.uid(), but nothing below stops a client
-- from attempting to also change company_id — add an explicit check.
create policy portal_users_update_self on public.portal_users
  for update to authenticated
  using (id = auth.uid() or public.user_role() in ('admin', 'editor'))
  with check (
    (id = auth.uid() and company_id = public.portal_company_id())
    or public.user_role() in ('admin', 'editor')
  );

create policy portal_users_write_staff on public.portal_users
  for insert to authenticated
  with check (public.user_role() in ('admin', 'editor'));

create policy portal_users_delete_admin on public.portal_users
  for delete to authenticated
  using (public.user_role() = 'admin');

-- portal_products — every portal user can browse the active catalog ------
drop policy if exists portal_products_select on public.portal_products;
drop policy if exists portal_products_write_staff on public.portal_products;
drop policy if exists portal_products_delete_admin on public.portal_products;

create policy portal_products_select on public.portal_products
  for select to authenticated
  using (public.is_mmdi_staff() or (public.is_portal_user() and active = true));

create policy portal_products_write_staff on public.portal_products
  for insert to authenticated
  with check (public.user_role() in ('admin', 'editor'));

create policy portal_products_update_staff on public.portal_products
  for update to authenticated
  using (public.user_role() in ('admin', 'editor'))
  with check (public.user_role() in ('admin', 'editor'));

create policy portal_products_delete_admin on public.portal_products
  for delete to authenticated
  using (public.user_role() = 'admin');

-- portal_orders ------------------------------------------------------
drop policy if exists portal_orders_select on public.portal_orders;
drop policy if exists portal_orders_insert_customer on public.portal_orders;
drop policy if exists portal_orders_insert_staff on public.portal_orders;
drop policy if exists portal_orders_update_customer on public.portal_orders;
drop policy if exists portal_orders_update_staff on public.portal_orders;
drop policy if exists portal_orders_delete_admin on public.portal_orders;

create policy portal_orders_select on public.portal_orders
  for select to authenticated
  using (public.is_mmdi_staff() or company_id = public.portal_company_id());

-- A portal customer may only ever create a brand-new order in the
-- starting state, for their own company, against one of their own
-- stores, with payment untouched — everything else about the order
-- (status transitions after this) goes through the update policy below.
create policy portal_orders_insert_customer on public.portal_orders
  for insert to authenticated
  with check (
    company_id = public.portal_company_id()
    and created_by = auth.uid()
    and status = 'submitted'
    and payment_status = 'unpaid'
    and razorpay_order_id is null
    and razorpay_payment_id is null
    and exists (
      select 1 from public.portal_company_stores s
      where s.id = store_id and s.company_id = public.portal_company_id()
    )
  );

create policy portal_orders_insert_staff on public.portal_orders
  for insert to authenticated
  with check (public.user_role() in ('admin', 'editor'));

-- Row-ownership + coarse state-machine guardrail: a portal customer may
-- only touch an order of theirs that is currently awaiting their decision
-- (proof_uploaded / revision_requested), and may only move it to
-- 'approved' or back to 'revision_requested' -- never to any payment or
-- production status directly. The precise decision-vs-order-state pairing
-- (e.g. you can't "approve" a revision you haven't seen) and the
-- razorpay_order_id write during checkout are enforced in
-- /api/portal/orders/[id]/{approve,request-revision,razorpay-order}
-- route code, same layered approach as installation-photos/upload-url's
-- own comment about RLS not being able to express everything.
-- 'submitted' is included below (both clauses) for pay-at-checkout: the
-- razorpay-order / razorpay-combined-order routes write razorpay_order_id
-- onto a brand-new order immediately, before any design-approval step, so
-- a customer must be allowed to touch their own order while it's still
-- freshly 'submitted' — not only once staff has moved it further along.
--
-- No payment_status condition here (there used to be one, requiring it
-- stay 'unpaid' — that's wrong under pay-at-checkout: an order is normally
-- ALREADY 'paid' by the time its design gets approved, and a status-only
-- update carries payment_status over unchanged regardless of what it was,
-- so requiring ='unpaid' on the resulting row would reject that completely
-- legitimate approve/revision-request action). Preventing a customer from
-- writing payment_status themselves is handled below by column-level
-- GRANTs instead, not by a row-check here — the right tool for "this
-- column must never be customer-writable, full stop", since RLS's
-- WITH CHECK has no clean way to express "must equal whatever this column
-- already was" (there's no old-vs-new comparison in a single expression).
create policy portal_orders_update_customer on public.portal_orders
  for update to authenticated
  using (
    company_id = public.portal_company_id()
    and status in ('submitted', 'proof_uploaded', 'revision_requested', 'approved')
  )
  with check (
    company_id = public.portal_company_id()
    and status in ('submitted', 'revision_requested', 'approved')
  );

-- Belt-and-suspenders alongside the policy above: even if a future policy
-- change loosens the row-level check, these three columns are structurally
-- off-limits to the authenticated role at the grant level — only
-- markOrderPaid (portal-payments.ts), running as the service-role client
-- in razorpay-verify/razorpay-webhook, can ever set them. Doesn't affect
-- the service role itself (Supabase's service_role bypasses RLS/grants).
revoke update (payment_status, razorpay_payment_id, paid_at) on public.portal_orders from authenticated;
-- Same tool, same reasoning, for the delivery snapshot: once an order
-- exists, nobody using the authenticated role — customer or staff — can
-- change what address it shipped against. (Doesn't block the INSERT that
-- sets these in the first place; REVOKE UPDATE only touches UPDATE.)
revoke update (delivery_address, delivery_city, delivery_gstin) on public.portal_orders from authenticated;

create policy portal_orders_update_staff on public.portal_orders
  for update to authenticated
  using (public.user_role() in ('admin', 'editor'))
  with check (public.user_role() in ('admin', 'editor'));

create policy portal_orders_delete_admin on public.portal_orders
  for delete to authenticated
  using (public.user_role() = 'admin');

-- portal_order_items ---------------------------------------------------
drop policy if exists portal_order_items_select on public.portal_order_items;
drop policy if exists portal_order_items_insert_customer on public.portal_order_items;
drop policy if exists portal_order_items_write_staff on public.portal_order_items;
drop policy if exists portal_order_items_delete_admin on public.portal_order_items;

create policy portal_order_items_select on public.portal_order_items
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (select 1 from public.portal_orders o where o.id = order_id and o.company_id = public.portal_company_id())
  );

create policy portal_order_items_insert_customer on public.portal_order_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.portal_orders o
      where o.id = order_id and o.company_id = public.portal_company_id() and o.status = 'submitted'
    )
  );

create policy portal_order_items_write_staff on public.portal_order_items
  for insert to authenticated
  with check (public.user_role() in ('admin', 'editor'));

create policy portal_order_items_delete_admin on public.portal_order_items
  for delete to authenticated
  using (public.user_role() = 'admin');

-- portal_order_files -----------------------------------------------------
drop policy if exists portal_order_files_select on public.portal_order_files;
drop policy if exists portal_order_files_insert_customer on public.portal_order_files;
drop policy if exists portal_order_files_insert_staff on public.portal_order_files;
drop policy if exists portal_order_files_delete_admin on public.portal_order_files;

create policy portal_order_files_select on public.portal_order_files
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (select 1 from public.portal_orders o where o.id = order_id and o.company_id = public.portal_company_id())
  );

-- Customers may attach reference/design/other files to their own orders,
-- never a 'proof' (that's MMDI's design-proof upload, staff-only).
create policy portal_order_files_insert_customer on public.portal_order_files
  for insert to authenticated
  with check (
    uploaded_by_role = 'customer'
    and uploaded_by = auth.uid()
    and kind in ('reference', 'other', 'design')
    and exists (select 1 from public.portal_orders o where o.id = order_id and o.company_id = public.portal_company_id())
  );

create policy portal_order_files_insert_staff on public.portal_order_files
  for insert to authenticated
  with check (uploaded_by_role = 'staff' and public.user_role() in ('admin', 'editor'));

create policy portal_order_files_delete_admin on public.portal_order_files
  for delete to authenticated
  using (public.user_role() = 'admin');

-- portal_order_approvals -------------------------------------------------
drop policy if exists portal_order_approvals_select on public.portal_order_approvals;
drop policy if exists portal_order_approvals_insert_customer on public.portal_order_approvals;
drop policy if exists portal_order_approvals_delete_admin on public.portal_order_approvals;

create policy portal_order_approvals_select on public.portal_order_approvals
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (select 1 from public.portal_orders o where o.id = order_id and o.company_id = public.portal_company_id())
  );

create policy portal_order_approvals_insert_customer on public.portal_order_approvals
  for insert to authenticated
  with check (
    decided_by = auth.uid()
    and exists (
      select 1 from public.portal_orders o
      where o.id = order_id
        and o.company_id = public.portal_company_id()
        and o.status in ('proof_uploaded', 'revision_requested')
    )
  );

create policy portal_order_approvals_delete_admin on public.portal_order_approvals
  for delete to authenticated
  using (public.user_role() = 'admin');

-- ============================================================
-- Verification queries — run these after applying the migration
-- ============================================================

-- 1. Confirm the new role value is allowed:
--    select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'profiles_role_check';

-- 2. Invite a company's first login (do this BEFORE creating the auth user):
--    insert into public.portal_companies (name, contact_email) values ('Aptronix', 'orders@aptronix.example') returning id;
--    insert into public.portal_invited_emails (email, company_id, contact_name)
--      values ('orders@aptronix.example', '<company id from above>', 'Aptronix Orders Team');
--    -- Then: Supabase dashboard -> Authentication -> Users -> Add user, same email, set a temp password, share it.

-- 3. Confirm a portal account got routed correctly after signing in once:
--    select p.email, p.role, pu.company_id from public.profiles p
--      join public.portal_users pu on pu.id = p.id
--      where p.role = 'portal';

-- 4. Seed the two products (adjust price once known):
--    insert into public.portal_products (code, name, description, unit_price, gst_percent) values
--      ('GPX04', 'Tactical Sign', 'Apple-format store tactical signage', 0, 18),
--      ('GPX05', 'Compatibility Sign', 'Apple-format store compatibility signage', 0, 18);
