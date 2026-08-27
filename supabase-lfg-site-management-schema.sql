-- MMDI ONE — Basil (Apple) LFG Site Management Portal: schema
-- Run this in the Supabase SQL Editor
-- (Project: mahin-aeroai's Project, https://vzyrvzgtjcodxkjydxxn.supabase.co).
--
-- "Basil" is this org's internal codename for Apple in written docs — this
-- schema manages the same real Apple-format-signage retail sites already
-- tracked (separately, disconnectedly) in two existing tables:
--   installation_report_stores / installation_report_store_sites
--     154 stores / ~181 sites, committed schema, has a working "Manage
--     Master Data" screen and Installation Report tool. No financial data.
--   apple_lfg_sites
--     852 rows across 9 chains. Where rate/installation-cost/scaffolding
--     financial data actually lives today. Only reachable via AI Copilot
--     chat right now — no screen shows it, and its schema was never
--     committed to this repo (set up directly in Supabase). See the
--     "LEGACY BACKFILL" section at the bottom — the apple_lfg_sites side of
--     that backfill is deliberately left as a TODO pending the real column
--     list (ask: `select column_name, data_type from
--     information_schema.columns where table_name = 'apple_lfg_sites'`).
--
-- This file does NOT touch, rename, or drop either legacy table — both
-- keep working exactly as they do today for whoever still uses those
-- screens. lfg_sites is a new, unified Site Master that the new portal
-- reads/writes going forward, cross-referenced to the legacy rows by
-- sfo_id so the same real site is never entered three times.
--
-- ROLE MODEL — a genuinely new dimension, not reused from portal_*
-- The customer portal (supabase-customer-portal-schema.sql) added a single
-- 'portal' role because ALL customer-portal users share one access shape
-- (their own company's orders only). This system has two shapes instead:
--   - MMDI staff (existing admin/editor/viewer roles, via is_mmdi_staff())
--     — full access, including every financial field.
--   - Partner users — a brand new external-login tier. Nothing in this
--     app currently has a "partner"/"vendor" concept; see the header of
--     supabase-customer-portal-schema.sql for why portal_* built its own
--     invited-email + role-value pattern rather than reusing profiles
--     wholesale, and this does the same: profiles.role gains a 5th value,
--     'lfg_partner', deliberately never added to the 24 internal-table
--     policies in supabase-role-based-rls-migration.sql or to any portal_*
--     policy — so an lfg_partner account gets zero rows everywhere except
--     its own lfg_* rows below.
--
-- FINANCIAL ISOLATION — the hard requirement, enforced at the RLS level
-- Every financial field lives on its OWN table (lfg_site_financials,
-- lfg_installation_costs), never as a column on a table a partner can
-- otherwise SELECT. No lfg_partner policy is created on either table AT
-- ALL — not "filtered", not "column-hidden", genuinely no grant. A
-- partner's `select * from lfg_site_financials` returns a permission
-- error / zero rows regardless of API request, browser dev tools, export,
-- direct URL, query parameter, or frontend code changes, because Postgres
-- itself denies the row before it ever reaches any app code. This is the
-- same reasoning as portal_orders' `revoke update` on payment columns —
-- the database is the enforcement point, not a frontend check.
--
-- AUDIT LOG — trigger-based, not app-code-based
-- Same reasoning as portal_store_address_history: application code
-- forgetting to log a change is how audit trails silently go stale. A
-- single generic trigger function (lfg_audit_log_row()) is attached to
-- every table below that needs one, writing old/new values automatically
-- on insert/update/delete — no call site has to remember to do it.
--
-- ORDER TO RUN THIS IN
-- After supabase-role-based-rls-migration.sql (needs public.user_role()
-- and public.is_mmdi_staff() — the latter is actually defined in
-- supabase-customer-portal-schema.sql, so run that one first too; this
-- file reuses it rather than redefining it). Safe to re-run in full.

-- ============================================================
-- STEP 1 — profiles.role gains a 5th value: 'lfg_partner'
-- ============================================================

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'editor', 'viewer', 'portal', 'lfg_partner'));

-- ============================================================
-- STEP 2 — lfg_partners (one row per installation/channel partner company)
-- ============================================================

create table if not exists public.lfg_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  contact_phone text,
  contact_email text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- ============================================================
-- STEP 3 — lfg_partner_invited_emails (staff-only allowlist, same
-- reasoning as portal_invited_emails — see that table's header comment)
-- ============================================================

create table if not exists public.lfg_partner_invited_emails (
  email text primary key,
  partner_id uuid not null references public.lfg_partners(id) on delete cascade,
  contact_name text,
  invited_by uuid references auth.users(id),
  invited_at timestamptz not null default now(),
  consumed_at timestamptz
);

-- ============================================================
-- STEP 4 — lfg_partner_users (one row per partner auth account, 1:1 with
-- auth.users, same shape as portal_users)
-- ============================================================

create table if not exists public.lfg_partner_users (
  id uuid primary key references auth.users(id) on delete cascade,
  partner_id uuid not null references public.lfg_partners(id) on delete cascade,
  full_name text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists lfg_partner_users_partner_idx on public.lfg_partner_users(partner_id);

-- ============================================================
-- STEP 5 — replace handle_new_user() to also route lfg_partner-invited
-- emails, alongside the existing portal-invite branch
-- ============================================================
-- NOTE: this REPLACES the version supabase-customer-portal-schema.sql
-- installed, adding one more branch — the portal branch is preserved
-- byte-for-byte so re-running this file never breaks the customer portal's
-- own invite flow.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  portal_invite record;
  lfg_invite record;
begin
  select * into portal_invite from public.portal_invited_emails
    where lower(email) = lower(new.email) and consumed_at is null
    limit 1;

  if portal_invite.email is not null then
    insert into public.profiles (id, email, role) values (new.id, new.email, 'portal')
      on conflict (id) do nothing;
    insert into public.portal_users (id, company_id) values (new.id, portal_invite.company_id)
      on conflict (id) do nothing;
    update public.portal_invited_emails set consumed_at = now() where email = portal_invite.email;
    return new;
  end if;

  select * into lfg_invite from public.lfg_partner_invited_emails
    where lower(email) = lower(new.email) and consumed_at is null
    limit 1;

  if lfg_invite.email is not null then
    insert into public.profiles (id, email, role) values (new.id, new.email, 'lfg_partner')
      on conflict (id) do nothing;
    insert into public.lfg_partner_users (id, partner_id, full_name) values (new.id, lfg_invite.partner_id, lfg_invite.contact_name)
      on conflict (id) do nothing;
    update public.lfg_partner_invited_emails set consumed_at = now() where email = lfg_invite.email;
    return new;
  end if;

  insert into public.profiles (id, email, role) values (new.id, new.email, 'viewer')
    on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Also extend the signup-domain guard so an lfg_partner-invited email can
-- register too (same pattern as the portal branch already added in
-- supabase-customer-portal-schema.sql STEP 11).
create or replace function public.enforce_mmdi_email_domain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null
     and new.email !~* '@mmdi\.in$'
     and not exists (select 1 from public.portal_invited_emails where lower(email) = lower(new.email) and consumed_at is null)
     and not exists (select 1 from public.lfg_partner_invited_emails where lower(email) = lower(new.email) and consumed_at is null)
  then
    raise exception 'Only @mmdi.in email addresses, or an email pre-invited to a portal, can register for MMDI ONE.';
  end if;
  return new;
end;
$$;

-- ============================================================
-- STEP 6 — helper functions (same style as portal_company_id()/
-- is_portal_user() in supabase-customer-portal-schema.sql)
-- ============================================================

create or replace function public.lfg_partner_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select partner_id from public.lfg_partner_users where id = auth.uid()
$$;

create or replace function public.is_lfg_partner_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.lfg_partner_users where id = auth.uid())
$$;

-- ============================================================
-- STEP 7 — lfg_sites (the unified Site Master)
-- ============================================================

create sequence if not exists public.lfg_site_no_seq;

create table if not exists public.lfg_sites (
  id uuid primary key default gen_random_uuid(),
  site_id text not null unique default ('LFG-' || lpad(nextval('public.lfg_site_no_seq')::text, 6, '0')),

  outlet_name text not null,
  program text,
  sfo_id text,
  city text,
  store_address text,
  material text,
  number_of_sites integer not null default 1,
  width numeric,
  height numeric,
  sqft numeric,
  asm_name text,
  asm_mobile text,
  asm_email text,
  escalation_email text,
  partner_id uuid references public.lfg_partners(id),
  -- R2 key, not a URL — always fetched via a short-lived presigned GET,
  -- same pattern as every file reference elsewhere in this app.
  site_reference_picture_path text,
  remarks text,

  site_status text not null default 'new' check (site_status in (
    'new', 'survey_pending', 'survey_completed', 'survey_approved',
    'production_pending', 'in_production', 'ready_for_dispatch',
    'dispatched', 'in_transit', 'delivered',
    'installation_planned', 'installation_in_progress', 'installation_completed',
    'active', 'deactivation_requested', 'deactivated',
    'on_hold', 'issue_attention_required'
  )),

  -- Cross-reference only, not a hard FK dependency for this table's own
  -- integrity — see header comment. sfo_id above is the real join key
  -- against both legacy tables; this uuid link is filled in by the
  -- backfill at the bottom once a legacy installation_report_stores row
  -- is matched.
  legacy_installation_report_store_id uuid references public.installation_report_stores(id),
  -- apple_lfg_sites has no committed schema to FK against — text-only
  -- cross-reference (its id::text) once matched by the backfill below.
  -- NOTE: the *raw* apple_lfg_sites row is deliberately NOT stored here —
  -- lfg_sites is partner-readable (row-scoped by partner_id), and the raw
  -- row contains rate/amount/gst/installation figures. See
  -- lfg_site_financials.legacy_apple_lfg_raw below instead, which lives on
  -- a table with zero partner grant.
  legacy_apple_lfg_site_ref text,

  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create index if not exists lfg_sites_partner_idx on public.lfg_sites(partner_id);
create index if not exists lfg_sites_status_idx on public.lfg_sites(site_status);
create index if not exists lfg_sites_sfo_id_idx on public.lfg_sites(sfo_id);
create index if not exists lfg_sites_program_idx on public.lfg_sites(program);
create index if not exists lfg_sites_city_idx on public.lfg_sites(city);

-- ============================================================
-- STEP 8 — lfg_site_status_history (append-only, one row per status change)
-- ============================================================

create table if not exists public.lfg_site_status_history (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.lfg_sites(id) on delete cascade,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now(),
  previous_status text,
  new_status text not null,
  remarks text
);

create index if not exists lfg_site_status_history_site_idx on public.lfg_site_status_history(site_id);

-- Auto-logged the same way portal_store_address_history is — a status
-- update through ANY path (admin UI, partner UI, future API) is captured
-- without the call site needing to remember to insert a history row.
create or replace function public.lfg_site_status_history_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.site_status is distinct from old.site_status then
    -- current_setting(..., true) (missing_ok) returns null rather than
    -- erroring when nothing set it -- the common case for any status
    -- change that doesn't go through lfg_change_site_status() below (a
    -- direct UPDATE, a future bulk-import path, etc.), which is exactly
    -- today's no-remarks behavior, unchanged.
    insert into public.lfg_site_status_history (site_id, changed_by, previous_status, new_status, remarks)
    values (new.id, auth.uid(), old.site_status, new.site_status, current_setting('lfg.status_change_remarks', true));
  end if;
  return new;
end;
$$;

drop trigger if exists lfg_sites_status_history_trigger on public.lfg_sites;
create trigger lfg_sites_status_history_trigger
  after update on public.lfg_sites
  for each row execute function public.lfg_site_status_history_log();

-- ============================================================
-- STEP 9 — lfg_site_financials (ADMIN ONLY — see header comment)
-- ============================================================

create table if not exists public.lfg_site_financials (
  site_id uuid primary key references public.lfg_sites(id) on delete cascade,
  rate numeric,
  amount numeric,
  packing_forwarding numeric,
  other_charges numeric,
  total_commercial_value numeric,
  -- GST on the printing/production side, and the GST-inclusive printing
  -- total — both real columns in the legacy apple_lfg_sites export
  -- (gst_amount, total_printing_amount); kept distinct from
  -- total_commercial_value (apple_lfg_sites.total) rather than collapsed
  -- into it, since the source keeps three different "total" concepts.
  gst_amount numeric,
  total_printing_amount numeric,
  material_cost numeric,
  production_cost numeric,
  installation_amount numeric,
  other_expenses numeric,
  total_project_cost numeric,
  margin numeric,
  commercial_terms text,
  -- Free-text budget/cost-centre reference carried over from
  -- apple_lfg_sites.budget — never a fixed enum in the source data.
  budget_category text,
  -- Full original apple_lfg_sites row, verbatim, for every site the
  -- backfill below matches — lossless audit trail for source columns that
  -- don't have a typed home anywhere (sheet_name, sl_no, sorting,
  -- bleed_mm, width_mm/height_mm, sqm, the pre-normalization free-text
  -- site_status, etc.). Safe here: this table has zero RLS grant to
  -- lfg_partner at all (see header comment) — unlike lfg_sites, which is
  -- partner-readable and must never carry this.
  legacy_apple_lfg_raw jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- ============================================================
-- STEP 10 — lfg_site_surveys
-- ============================================================

create table if not exists public.lfg_site_surveys (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.lfg_sites(id) on delete cascade,
  survey_date date,
  measured_width numeric,
  measured_height numeric,
  measurements_remarks text,
  report_path text,
  status text not null default 'pending' check (status in ('pending', 'completed', 'approved')),
  submitted_by uuid references auth.users(id),
  submitted_at timestamptz,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists lfg_site_surveys_site_idx on public.lfg_site_surveys(site_id);

-- ============================================================
-- STEP 11 — lfg_site_documents (per-site document repository)
-- ============================================================

create table if not exists public.lfg_site_documents (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.lfg_sites(id) on delete cascade,
  category text not null check (category in ('reference', 'survey', 'installation', 'other')),
  file_name text not null,
  file_type text,
  relative_path text not null,
  file_size bigint,
  version integer not null default 1,
  uploaded_by uuid references auth.users(id),
  uploaded_by_role text check (uploaded_by_role in ('staff', 'partner')),
  uploaded_at timestamptz not null default now()
);

create index if not exists lfg_site_documents_site_idx on public.lfg_site_documents(site_id);

-- ============================================================
-- STEP 12 — lfg_production
-- ============================================================

create table if not exists public.lfg_production (
  site_id uuid primary key references public.lfg_sites(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed')),
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- ============================================================
-- STEP 13 — lfg_installations + lfg_installation_costs (costs split out,
-- ADMIN ONLY, same reasoning as lfg_site_financials)
-- ============================================================

create table if not exists public.lfg_installations (
  site_id uuid primary key references public.lfg_sites(id) on delete cascade,
  installation_required boolean not null default true,
  scaffolding_required boolean not null default false,
  scaffolding_size text,
  installation_date date,
  -- Free text today; can become a FK to installation_report_teams once
  -- that roster is confirmed as the right one to reuse for this program.
  installation_team text,
  installation_status text not null default 'pending' check (installation_status in (
    'pending', 'planned', 'in_progress', 'completed', 'issue'
  )),
  installation_remarks text,
  installation_report_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.lfg_installation_costs (
  site_id uuid primary key references public.lfg_sites(id) on delete cascade,
  installation_rate numeric,
  installation_amount numeric,
  scaffolding_rate numeric,
  scaffolding_amount numeric,
  -- Renamed from an earlier travelling_transportation to match the real
  -- apple_lfg_sites.installation_travelling column it backfills from.
  installation_travelling numeric,
  scaffolding_plus_travelling numeric,
  installation_subtotal numeric,
  installation_gst_amount numeric,
  labour_other_expenses numeric,
  total_installation_cost numeric,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.lfg_installation_photos (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.lfg_sites(id) on delete cascade,
  kind text not null check (kind in ('before', 'after', 'completion')),
  relative_path text not null,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now()
);

create index if not exists lfg_installation_photos_site_idx on public.lfg_installation_photos(site_id);

-- ============================================================
-- STEP 14 — lfg_shipments + lfg_shipment_events (courier/AWB tracking —
-- entirely new ground, nothing like this exists anywhere in this app yet)
-- ============================================================

create table if not exists public.lfg_shipments (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.lfg_sites(id) on delete cascade,
  courier text,
  awb_number text,
  dispatch_date date,
  expected_delivery_date date,
  shipment_contents text,
  number_of_packages integer,
  package_details text,
  -- Broad shipment-lifecycle status, shown as the timeline on Site 360.
  current_status text not null default 'shipment_created' check (current_status in (
    'shipment_created', 'dispatched', 'in_transit', 'at_hub',
    'out_for_delivery', 'delivered',
    'delayed', 'delivery_exception', 'undelivered'
  )),
  delivery_status text not null default 'pod_pending' check (delivery_status in ('pod_pending', 'pod_received', 'not_applicable')),
  delivery_date date,
  pod_path text,
  courier_remarks text,
  internal_remarks text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create index if not exists lfg_shipments_site_idx on public.lfg_shipments(site_id);
create index if not exists lfg_shipments_awb_idx on public.lfg_shipments(awb_number);
create index if not exists lfg_shipments_status_idx on public.lfg_shipments(current_status);

-- One row per tracking-timeline event. source='api' rows are the plug-in
-- point for live courier tracking (see OPERATIONS.md's write-up of this
-- feature for the integration architecture); source='manual' is today's
-- only path until a courier API is wired up. raw_payload keeps the
-- untouched API response for whichever courier eventually gets integrated,
-- without needing a schema change per courier.
create table if not exists public.lfg_shipment_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.lfg_shipments(id) on delete cascade,
  event_status text not null,
  event_time timestamptz not null default now(),
  location text,
  source text not null default 'manual' check (source in ('manual', 'api')),
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists lfg_shipment_events_shipment_idx on public.lfg_shipment_events(shipment_id);

-- ============================================================
-- STEP 15 — lfg_issues (partner-raisable requests/escalations)
-- ============================================================

create table if not exists public.lfg_issues (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.lfg_sites(id) on delete cascade,
  raised_by uuid references auth.users(id),
  raised_by_role text check (raised_by_role in ('staff', 'partner')),
  issue_type text,
  description text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  resolution_remarks text,
  created_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz
);

create index if not exists lfg_issues_site_idx on public.lfg_issues(site_id);

-- ============================================================
-- STEP 16 — lfg_notifications
-- ============================================================

create table if not exists public.lfg_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  site_id uuid references public.lfg_sites(id) on delete cascade,
  type text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists lfg_notifications_recipient_idx on public.lfg_notifications(recipient_id, read_at);

-- ============================================================
-- STEP 17 — lfg_audit_log (generic, trigger-driven — same
-- never-editable-by-app-code reasoning as gmail_activity_log)
-- ============================================================

create table if not exists public.lfg_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  user_email text,
  action text not null check (action in ('insert', 'update', 'delete')),
  entity_type text not null,
  entity_id text not null,
  site_id uuid references public.lfg_sites(id),
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lfg_audit_log_site_idx on public.lfg_audit_log(site_id);
create index if not exists lfg_audit_log_entity_idx on public.lfg_audit_log(entity_type, entity_id);

-- Generic trigger function — attach to any lfg_* table via
-- `for each row execute function public.lfg_audit_log_row()`. Reads
-- site_id off the row when the column exists under that exact name;
-- tables where the row IS the site (lfg_sites itself) or has no direct
-- site_id (lfg_partners) just get a null site_id, still fully logged.
create or replace function public.lfg_audit_log_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site_id uuid;
  v_entity_id text;
  v_row jsonb;
begin
  -- NEW/OLD are pseudo-record types that can't be passed through
  -- COALESCE directly (composite-record COALESCE isn't reliable in
  -- plpgsql) — branch explicitly instead.
  if TG_OP = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  v_entity_id := v_row ->> 'id';
  begin
    if TG_TABLE_NAME = 'lfg_sites' then
      v_site_id := (v_row ->> 'id')::uuid;
    else
      v_site_id := (v_row ->> 'site_id')::uuid;
    end if;
  exception when others then
    v_site_id := null;
  end;

  insert into public.lfg_audit_log (user_id, user_email, action, entity_type, entity_id, site_id, old_value, new_value)
  values (
    auth.uid(),
    (select email from public.profiles where id = auth.uid()),
    lower(TG_OP),
    TG_TABLE_NAME,
    coalesce(v_entity_id, 'unknown'),
    v_site_id,
    case when TG_OP in ('update', 'delete') then to_jsonb(old) else null end,
    case when TG_OP in ('update', 'insert') then to_jsonb(new) else null end
  );

  if TG_OP = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;

DO $$
DECLARE
  t text;
  audited_tables text[] := ARRAY[
    'lfg_sites', 'lfg_site_financials', 'lfg_installations', 'lfg_installation_costs',
    'lfg_shipments', 'lfg_production', 'lfg_partners'
  ];
BEGIN
  FOREACH t IN ARRAY audited_tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_audit_trigger', t);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.lfg_audit_log_row()',
      t || '_audit_trigger', t
    );
  END LOOP;
END $$;

-- ============================================================
-- STEP 18 — lfg_deactivation_requests
-- ============================================================

create table if not exists public.lfg_deactivation_requests (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.lfg_sites(id) on delete cascade,
  reason text not null,
  requested_by uuid references auth.users(id),
  request_date timestamptz not null default now(),
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  approved_by uuid references auth.users(id),
  approval_date timestamptz,
  deactivation_date date,
  remarks text
);

create index if not exists lfg_deactivation_requests_site_idx on public.lfg_deactivation_requests(site_id);

-- ============================================================
-- STEP 19 — Row Level Security
-- ============================================================

DO $$
DECLARE
  t text;
  all_tables text[] := ARRAY[
    'lfg_partners', 'lfg_partner_invited_emails', 'lfg_partner_users',
    'lfg_sites', 'lfg_site_status_history', 'lfg_site_financials',
    'lfg_site_surveys', 'lfg_site_documents', 'lfg_production',
    'lfg_installations', 'lfg_installation_costs', 'lfg_installation_photos',
    'lfg_shipments', 'lfg_shipment_events', 'lfg_issues', 'lfg_notifications',
    'lfg_audit_log', 'lfg_deactivation_requests'
  ];
BEGIN
  FOREACH t IN ARRAY all_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ---- lfg_partners: staff full; partner can read their own row ----------
drop policy if exists lfg_partners_select on public.lfg_partners;
drop policy if exists lfg_partners_write_staff on public.lfg_partners;

create policy lfg_partners_select on public.lfg_partners
  for select to authenticated
  using (public.is_mmdi_staff() or id = public.lfg_partner_id());

create policy lfg_partners_write_staff on public.lfg_partners
  for all to authenticated
  using (public.user_role() in ('admin', 'editor'))
  with check (public.user_role() in ('admin', 'editor'));

-- ---- lfg_partner_invited_emails: staff only ------------------------------
drop policy if exists lfg_partner_invites_staff_all on public.lfg_partner_invited_emails;
create policy lfg_partner_invites_staff_all on public.lfg_partner_invited_emails
  for all to authenticated
  using (public.user_role() in ('admin', 'editor'))
  with check (public.user_role() in ('admin', 'editor'));

-- ---- lfg_partner_users: staff full; a partner user reads their own ------
drop policy if exists lfg_partner_users_select on public.lfg_partner_users;
drop policy if exists lfg_partner_users_write_staff on public.lfg_partner_users;

create policy lfg_partner_users_select on public.lfg_partner_users
  for select to authenticated
  using (public.is_mmdi_staff() or id = auth.uid());

create policy lfg_partner_users_write_staff on public.lfg_partner_users
  for all to authenticated
  using (public.user_role() in ('admin', 'editor'))
  with check (public.user_role() in ('admin', 'editor'));

-- ---- lfg_sites: staff full; partner scoped to their own sites -----------
drop policy if exists lfg_sites_select on public.lfg_sites;
drop policy if exists lfg_sites_insert on public.lfg_sites;
drop policy if exists lfg_sites_update on public.lfg_sites;
drop policy if exists lfg_sites_delete_staff on public.lfg_sites;

create policy lfg_sites_select on public.lfg_sites
  for select to authenticated
  using (public.is_mmdi_staff() or partner_id = public.lfg_partner_id());

-- A partner adding "New Site" (spec section 7) creates it against their
-- own partner_id only; staff can create for any partner.
create policy lfg_sites_insert on public.lfg_sites
  for insert to authenticated
  with check (
    public.user_role() in ('admin', 'editor')
    or (public.is_lfg_partner_user() and partner_id = public.lfg_partner_id())
  );

-- Row-ownership only at the RLS level — WHICH columns a partner may touch
-- (operational fields, not master identity/financial linkage) is enforced
-- by the guard trigger below, same tool used for portal_company_stores'
-- customer self-service edit.
create policy lfg_sites_update on public.lfg_sites
  for update to authenticated
  using (public.user_role() in ('admin', 'editor') or partner_id = public.lfg_partner_id())
  with check (public.user_role() in ('admin', 'editor') or partner_id = public.lfg_partner_id());

create policy lfg_sites_delete_staff on public.lfg_sites
  for delete to authenticated
  using (public.user_role() = 'admin');

create or replace function public.lfg_sites_guard_partner_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_lfg_partner_user() and not public.is_mmdi_staff() then
    if new.partner_id is distinct from old.partner_id
       or new.outlet_name is distinct from old.outlet_name
       or new.program is distinct from old.program
       or new.sfo_id is distinct from old.sfo_id
    then
      raise exception 'Partners cannot change site ownership, outlet name, program, or SFO ID — contact MMDI.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists lfg_sites_guard_partner_update_trigger on public.lfg_sites;
create trigger lfg_sites_guard_partner_update_trigger
  before update on public.lfg_sites
  for each row execute function public.lfg_sites_guard_partner_update();

-- The Site Status change action (spec: every change recorded with User,
-- Date, Time, Previous Status, New Status, Remarks) is a single RPC
-- rather than a bare `update lfg_sites set site_status = ...` from the
-- client, purely so the optional remarks reach the history row the
-- trigger above writes -- an ordinary UPDATE has no side-channel for
-- that, and updating the history row after the fact would be a second,
-- separately-racy statement. security invoker (the default -- no
-- `security definer` here) is deliberate: this must run as the calling
-- user so lfg_sites_update's own RLS (staff full; partner scoped to
-- their own site) and the guard trigger above both still apply exactly
-- as if the caller had written the UPDATE directly -- this function
-- grants no privilege a caller doesn't already have.
create or replace function public.lfg_change_site_status(
  p_site_id uuid,
  p_new_status text,
  p_remarks text default null
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_remarks is not null then
    perform set_config('lfg.status_change_remarks', p_remarks, true);
  end if;
  update public.lfg_sites
    set site_status = p_new_status, updated_at = now(), updated_by = auth.uid()
    where id = p_site_id;
end;
$$;

grant execute on function public.lfg_change_site_status(uuid, text, text) to authenticated;

-- ---- lfg_site_status_history: staff full; partner reads their sites' ----
drop policy if exists lfg_site_status_history_select on public.lfg_site_status_history;
create policy lfg_site_status_history_select on public.lfg_site_status_history
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_site_status_history.site_id and s.partner_id = public.lfg_partner_id())
  );
-- History rows are written only by the trigger above (security definer) —
-- no direct insert/update/delete policy for ANY role, matching the
-- append-only reasoning used for portal_store_address_history.

-- ---- lfg_site_financials: ADMIN/EDITOR ONLY. No partner policy exists. --
drop policy if exists lfg_site_financials_staff_all on public.lfg_site_financials;
create policy lfg_site_financials_staff_all on public.lfg_site_financials
  for all to authenticated
  using (public.user_role() in ('admin', 'editor'))
  with check (public.user_role() in ('admin', 'editor'));

-- ---- lfg_site_surveys ----------------------------------------------------
drop policy if exists lfg_site_surveys_select on public.lfg_site_surveys;
drop policy if exists lfg_site_surveys_insert on public.lfg_site_surveys;
drop policy if exists lfg_site_surveys_update_staff on public.lfg_site_surveys;
drop policy if exists lfg_site_surveys_delete_staff on public.lfg_site_surveys;

create policy lfg_site_surveys_select on public.lfg_site_surveys
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_site_surveys.site_id and s.partner_id = public.lfg_partner_id())
  );

create policy lfg_site_surveys_insert on public.lfg_site_surveys
  for insert to authenticated
  with check (
    public.user_role() in ('admin', 'editor')
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_site_surveys.site_id and s.partner_id = public.lfg_partner_id())
  );

create policy lfg_site_surveys_update_staff on public.lfg_site_surveys
  for update to authenticated
  using (public.user_role() in ('admin', 'editor'))
  with check (public.user_role() in ('admin', 'editor'));

create policy lfg_site_surveys_delete_staff on public.lfg_site_surveys
  for delete to authenticated
  using (public.user_role() = 'admin');

-- ---- lfg_site_documents ---------------------------------------------------
drop policy if exists lfg_site_documents_select on public.lfg_site_documents;
drop policy if exists lfg_site_documents_insert on public.lfg_site_documents;
drop policy if exists lfg_site_documents_delete on public.lfg_site_documents;

create policy lfg_site_documents_select on public.lfg_site_documents
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_site_documents.site_id and s.partner_id = public.lfg_partner_id())
  );

create policy lfg_site_documents_insert on public.lfg_site_documents
  for insert to authenticated
  with check (
    public.user_role() in ('admin', 'editor')
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_site_documents.site_id and s.partner_id = public.lfg_partner_id())
  );

create policy lfg_site_documents_delete on public.lfg_site_documents
  for delete to authenticated
  using (
    public.user_role() = 'admin'
    or (uploaded_by = auth.uid() and exists (select 1 from public.lfg_sites s where s.id = public.lfg_site_documents.site_id and s.partner_id = public.lfg_partner_id()))
  );

-- ---- lfg_production: staff full; partner can read (no cost fields here) -
drop policy if exists lfg_production_select on public.lfg_production;
drop policy if exists lfg_production_write_staff on public.lfg_production;

create policy lfg_production_select on public.lfg_production
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_production.site_id and s.partner_id = public.lfg_partner_id())
  );

create policy lfg_production_write_staff on public.lfg_production
  for all to authenticated
  using (public.user_role() in ('admin', 'editor'))
  with check (public.user_role() in ('admin', 'editor'));

-- ---- lfg_installations: staff full; partner can read+update status/dates
drop policy if exists lfg_installations_select on public.lfg_installations;
drop policy if exists lfg_installations_write on public.lfg_installations;

create policy lfg_installations_select on public.lfg_installations
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_installations.site_id and s.partner_id = public.lfg_partner_id())
  );

-- Partner permission per spec section 7 ("Update installation status") —
-- row ownership at RLS level; no cost columns exist on this table to leak
-- (they live on lfg_installation_costs below, which partners never get a
-- policy on at all).
create policy lfg_installations_write on public.lfg_installations
  for all to authenticated
  using (
    public.user_role() in ('admin', 'editor')
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_installations.site_id and s.partner_id = public.lfg_partner_id())
  )
  with check (
    public.user_role() in ('admin', 'editor')
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_installations.site_id and s.partner_id = public.lfg_partner_id())
  );

-- ---- lfg_installation_costs: ADMIN/EDITOR ONLY. No partner policy. ------
drop policy if exists lfg_installation_costs_staff_all on public.lfg_installation_costs;
create policy lfg_installation_costs_staff_all on public.lfg_installation_costs
  for all to authenticated
  using (public.user_role() in ('admin', 'editor'))
  with check (public.user_role() in ('admin', 'editor'));

-- ---- lfg_installation_photos ---------------------------------------------
drop policy if exists lfg_installation_photos_select on public.lfg_installation_photos;
drop policy if exists lfg_installation_photos_insert on public.lfg_installation_photos;
drop policy if exists lfg_installation_photos_delete on public.lfg_installation_photos;

create policy lfg_installation_photos_select on public.lfg_installation_photos
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_installation_photos.site_id and s.partner_id = public.lfg_partner_id())
  );

create policy lfg_installation_photos_insert on public.lfg_installation_photos
  for insert to authenticated
  with check (
    public.user_role() in ('admin', 'editor')
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_installation_photos.site_id and s.partner_id = public.lfg_partner_id())
  );

create policy lfg_installation_photos_delete on public.lfg_installation_photos
  for delete to authenticated
  using (public.user_role() = 'admin');

-- ---- lfg_shipments: staff full; partner can read+write their sites' -----
-- (spec: partners "View courier tracking" + "Enter AWB information where
-- permitted" — no financial fields on this table, so full row access is
-- safe.)
drop policy if exists lfg_shipments_select on public.lfg_shipments;
drop policy if exists lfg_shipments_write on public.lfg_shipments;

create policy lfg_shipments_select on public.lfg_shipments
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_shipments.site_id and s.partner_id = public.lfg_partner_id())
  );

create policy lfg_shipments_write on public.lfg_shipments
  for all to authenticated
  using (
    public.user_role() in ('admin', 'editor')
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_shipments.site_id and s.partner_id = public.lfg_partner_id())
  )
  with check (
    public.user_role() in ('admin', 'editor')
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_shipments.site_id and s.partner_id = public.lfg_partner_id())
  );

-- ---- lfg_shipment_events --------------------------------------------------
drop policy if exists lfg_shipment_events_select on public.lfg_shipment_events;
drop policy if exists lfg_shipment_events_insert on public.lfg_shipment_events;
drop policy if exists lfg_shipment_events_delete_admin on public.lfg_shipment_events;

create policy lfg_shipment_events_select on public.lfg_shipment_events
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (
      select 1 from public.lfg_shipments sh join public.lfg_sites s on s.id = sh.site_id
      where sh.id = shipment_id and s.partner_id = public.lfg_partner_id()
    )
  );

create policy lfg_shipment_events_insert on public.lfg_shipment_events
  for insert to authenticated
  with check (
    public.user_role() in ('admin', 'editor')
    or exists (
      select 1 from public.lfg_shipments sh join public.lfg_sites s on s.id = sh.site_id
      where sh.id = shipment_id and s.partner_id = public.lfg_partner_id()
    )
  );
-- Events are an append-only timeline — no update/delete policy for anyone
-- but admin, matching the audit-log style reasoning (a wrong manual entry
-- gets corrected with a new event, not by editing history).
create policy lfg_shipment_events_delete_admin on public.lfg_shipment_events
  for delete to authenticated using (public.user_role() = 'admin');

-- ---- lfg_issues: staff full; partner can raise + read their sites' ------
drop policy if exists lfg_issues_select on public.lfg_issues;
drop policy if exists lfg_issues_insert on public.lfg_issues;
drop policy if exists lfg_issues_update on public.lfg_issues;

create policy lfg_issues_select on public.lfg_issues
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_issues.site_id and s.partner_id = public.lfg_partner_id())
  );

create policy lfg_issues_insert on public.lfg_issues
  for insert to authenticated
  with check (
    public.user_role() in ('admin', 'editor')
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_issues.site_id and s.partner_id = public.lfg_partner_id())
  );

-- Resolving an issue (status/resolution_remarks) is staff-only; a partner
-- can raise one but not mark it resolved themselves.
create policy lfg_issues_update on public.lfg_issues
  for update to authenticated
  using (public.user_role() in ('admin', 'editor'))
  with check (public.user_role() in ('admin', 'editor'));

-- ---- lfg_notifications: each user reads only their own ------------------
drop policy if exists lfg_notifications_select_own on public.lfg_notifications;
drop policy if exists lfg_notifications_update_own on public.lfg_notifications;
drop policy if exists lfg_notifications_insert_staff on public.lfg_notifications;

create policy lfg_notifications_select_own on public.lfg_notifications
  for select to authenticated
  using (recipient_id = auth.uid());

-- Marking as read is the only thing a recipient can change about their
-- own notification.
create policy lfg_notifications_update_own on public.lfg_notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

create policy lfg_notifications_insert_staff on public.lfg_notifications
  for insert to authenticated
  with check (public.user_role() in ('admin', 'editor'));

-- ---- lfg_audit_log: admin-read-only, insert only via the trigger's ------
-- security-definer function (no direct-insert policy for any role at all)
drop policy if exists lfg_audit_log_select_admin on public.lfg_audit_log;
create policy lfg_audit_log_select_admin on public.lfg_audit_log
  for select to authenticated
  using (public.user_role() in ('admin', 'editor'));

-- ---- lfg_deactivation_requests --------------------------------------------
drop policy if exists lfg_deactivation_requests_select on public.lfg_deactivation_requests;
drop policy if exists lfg_deactivation_requests_insert on public.lfg_deactivation_requests;
drop policy if exists lfg_deactivation_requests_update_staff on public.lfg_deactivation_requests;

create policy lfg_deactivation_requests_select on public.lfg_deactivation_requests
  for select to authenticated
  using (
    public.is_mmdi_staff()
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_deactivation_requests.site_id and s.partner_id = public.lfg_partner_id())
  );

create policy lfg_deactivation_requests_insert on public.lfg_deactivation_requests
  for insert to authenticated
  with check (
    public.user_role() in ('admin', 'editor')
    or exists (select 1 from public.lfg_sites s where s.id = public.lfg_deactivation_requests.site_id and s.partner_id = public.lfg_partner_id())
  );

-- Only staff approve/reject a deactivation request.
create policy lfg_deactivation_requests_update_staff on public.lfg_deactivation_requests
  for update to authenticated
  using (public.user_role() in ('admin', 'editor'))
  with check (public.user_role() in ('admin', 'editor'));

-- ============================================================
-- STEP 20 — LEGACY BACKFILL from installation_report_stores
-- (safe to re-run — only inserts sites not already cross-referenced)
-- ============================================================

insert into public.lfg_sites (
  outlet_name, program, sfo_id, store_address, number_of_sites,
  material, asm_name, asm_mobile, legacy_installation_report_store_id
)
select
  irs.store_name, irs.program, irs.sfo_id, irs.address, irs.no_of_sites,
  irs.default_material, irs.asm_name, irs.asm_contact, irs.id
from public.installation_report_stores irs
where irs.active
  and not exists (
    select 1 from public.lfg_sites ls where ls.legacy_installation_report_store_id = irs.id
  );

-- ============================================================
-- STEP 21 — LEGACY BACKFILL from apple_lfg_sites (the financial data)
-- ============================================================
-- Real column list confirmed 2026-08-27 via
--   select column_name, data_type, is_nullable from information_schema.columns
--   where table_name = 'apple_lfg_sites' order by ordinal_position;
-- run against the live project:
--   id uuid, sheet_name text, sl_no int, program text, sorting int,
--   apple_store_id text, store_name text, city text, material text,
--   site_status text, no_of_sites int, width_mm/height_mm/bleed_mm numeric,
--   width_inches/height_inches numeric, sqft numeric, rate numeric,
--   amount numeric, packing_forwarding numeric, total numeric,
--   gst_amount numeric, total_printing_amount numeric,
--   installation_team text, address text, remarks text, created_at tstz,
--   sqm numeric, installation_rate numeric, installation_amount numeric,
--   scaffolding text, scaffolding_size numeric, scaffolding_rate numeric,
--   scaffolding_amount numeric, installation_travelling numeric,
--   scaffolding_plus_travelling numeric, installation_subtotal numeric,
--   installation_gst_amount numeric, total_installation_amount numeric,
--   budget text.
--
-- DESIGN DECISION: every apple_lfg_sites row becomes its OWN lfg_sites
-- row, rather than being merged into the rows the STEP 20 backfill just
-- created from installation_report_stores. Reasoning: apple_lfg_sites
-- rows aren't "extra financial data to attach to an existing store" — each
-- row already carries the full Site Master shape (store, city, material,
-- dimensions, status) in its own right, and one physical store can
-- legitimately have more than one apple_lfg_sites row (852 rows across 9
-- chains vs. 154 installation_report_stores rows rules out assuming a
-- clean 1:1 join blind). lfg_site_financials/lfg_installation_costs are
-- one-row-per-site tables — silently merging two real, distinct financial
-- rows into one by a fuzzy text match would permanently discard one of
-- them. Creating a fresh lfg_sites row per apple_lfg_sites row cannot lose
-- data; at worst it leaves a lighter manual dedup step for staff later
-- (Site Master rows are easy to review/merge from the UI — a silently
-- dropped financial row is not recoverable).
--
-- What this DOES still do: opportunistically sets
-- legacy_installation_report_store_id when apple_store_id matches exactly
-- one installation_report_stores.sfo_id, purely as a staff-visible
-- cross-reference — it never reuses that store's existing lfg_sites row
-- or merges data into it.
--
-- UNITS: apple_lfg_sites carries both mm and inch columns for width/
-- height. width_inches/height_inches are used as-is when present;
-- otherwise the *_mm value is converted (÷25.4), never used as if it were
-- already inches — mixing the two units unconverted would silently corrupt
-- every dimension on any row missing the inches columns.
--
-- SITE STATUS: apple_lfg_sites.site_status is free text from the source
-- spreadsheets, not this schema's 18-value enum. The mapping below is a
-- best-effort ILIKE pattern match; before running this in production,
-- inspect what's actually there:
--   select site_status, count(*) from public.apple_lfg_sites
--   group by 1 order by 2 desc;
-- Anything the pattern match doesn't recognize lands in
-- 'issue_attention_required' with the original text preserved verbatim in
-- remarks (prefixed "[legacy status: ...]") and in full in
-- lfg_site_financials.legacy_apple_lfg_raw — nothing is silently dropped,
-- but a human should sweep issue_attention_required sites after the first
-- real run and correct any that were mismapped.
--
-- Safe to re-run: guarded by a unique index on legacy_apple_lfg_site_ref,
-- so a second run only picks up apple_lfg_sites rows added since. Also a
-- no-op (with a NOTICE) on any database where apple_lfg_sites doesn't
-- exist yet, so this file stays runnable end-to-end before that table is
-- present.

create unique index if not exists lfg_sites_legacy_apple_ref_uidx
  on public.lfg_sites (legacy_apple_lfg_site_ref)
  where legacy_apple_lfg_site_ref is not null;

do $$
declare
  a record;
  v_site_id uuid;
  v_legacy_store_id uuid;
  v_match_count integer;
  v_mapped_status text;
begin
  if to_regclass('public.apple_lfg_sites') is null then
    raise notice 'apple_lfg_sites not found — skipping this backfill.';
    return;
  end if;

  -- als (not "a") on purpose — this query defines the loop variable "a",
  -- so it cannot reference "a" itself inside its own where-clause.
  for a in
    select als.* from public.apple_lfg_sites als
    where not exists (
      select 1 from public.lfg_sites ls
      where ls.legacy_apple_lfg_site_ref = als.id::text
    )
  loop
    v_legacy_store_id := null;
    if a.apple_store_id is not null then
      select count(*) into v_match_count
      from public.installation_report_stores irs
      where lower(trim(irs.sfo_id)) = lower(trim(a.apple_store_id));
      if v_match_count = 1 then
        select irs.id into v_legacy_store_id
        from public.installation_report_stores irs
        where lower(trim(irs.sfo_id)) = lower(trim(a.apple_store_id));
      end if;
    end if;

    v_mapped_status := case
      when a.site_status is null then 'new'
      when a.site_status ilike '%deactivat%' then 'deactivated'
      when a.site_status ilike '%active%' then 'active'
      when a.site_status ilike '%hold%' then 'on_hold'
      when a.site_status ilike '%cancel%' then 'issue_attention_required'
      when a.site_status ilike '%install%complet%'
        or a.site_status ilike '%complet%install%' then 'installation_completed'
      when a.site_status ilike '%install%progress%'
        or a.site_status ilike '%install%wip%' then 'installation_in_progress'
      when a.site_status ilike '%install%plan%' then 'installation_planned'
      when a.site_status ilike '%install%' then 'installation_planned'
      when a.site_status ilike '%deliver%' then 'delivered'
      when a.site_status ilike '%transit%' then 'in_transit'
      when a.site_status ilike '%ready%dispatch%' then 'ready_for_dispatch'
      when a.site_status ilike '%dispatch%' then 'dispatched'
      when a.site_status ilike '%production%'
        or a.site_status ilike '%wip%'
        or a.site_status ilike '%progress%' then 'in_production'
      when a.site_status ilike '%survey%approv%' then 'survey_approved'
      when a.site_status ilike '%survey%complet%' then 'survey_completed'
      when a.site_status ilike '%survey%' then 'survey_pending'
      when a.site_status ilike '%complet%' or a.site_status ilike '%done%' then 'active'
      when a.site_status ilike '%pending%' or a.site_status ilike '%new%' then 'new'
      else 'issue_attention_required'
    end;

    insert into public.lfg_sites (
      outlet_name, program, sfo_id, city, store_address, material,
      number_of_sites, width, height, sqft,
      site_status, remarks,
      legacy_installation_report_store_id, legacy_apple_lfg_site_ref,
      created_at
    ) values (
      coalesce(a.store_name, 'Unknown outlet — apple_lfg_sites #' || a.id::text),
      coalesce(a.program, a.sheet_name),
      a.apple_store_id, a.city, a.address, a.material,
      coalesce(a.no_of_sites, 1),
      coalesce(a.width_inches, round(a.width_mm / 25.4, 2)),
      coalesce(a.height_inches, round(a.height_mm / 25.4, 2)),
      a.sqft,
      v_mapped_status,
      trim(both ' ' from
        coalesce(a.remarks, '') ||
        case when a.site_status is not null and v_mapped_status = 'issue_attention_required'
          then ' [legacy status: ' || a.site_status || ']' else '' end
      ),
      v_legacy_store_id, a.id::text,
      coalesce(a.created_at, now())
    )
    returning id into v_site_id;

    insert into public.lfg_site_financials (
      site_id, rate, amount, packing_forwarding, total_commercial_value,
      gst_amount, total_printing_amount, installation_amount,
      budget_category, legacy_apple_lfg_raw
    ) values (
      v_site_id, a.rate, a.amount, a.packing_forwarding, a.total,
      a.gst_amount, a.total_printing_amount, a.installation_amount,
      a.budget, to_jsonb(a)
    );

    insert into public.lfg_installation_costs (
      site_id, installation_rate, installation_amount, scaffolding_rate,
      scaffolding_amount, installation_travelling,
      scaffolding_plus_travelling, installation_subtotal,
      installation_gst_amount, total_installation_cost
    ) values (
      v_site_id, a.installation_rate, a.installation_amount, a.scaffolding_rate,
      a.scaffolding_amount, a.installation_travelling,
      a.scaffolding_plus_travelling, a.installation_subtotal,
      a.installation_gst_amount, a.total_installation_amount
    );

    insert into public.lfg_installations (
      site_id, scaffolding_required, scaffolding_size, installation_team
    ) values (
      v_site_id,
      coalesce(a.scaffolding ilike 'yes%', a.scaffolding_amount > 0, false),
      a.scaffolding_size::text, a.installation_team
    );
  end loop;
end;
$$;
