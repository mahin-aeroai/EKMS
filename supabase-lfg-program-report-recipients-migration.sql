-- ============================================================
-- LFG Connect Updates email -- recipients config + send log
--
-- Run this AFTER supabase-lfg-site-management-schema.sql (needs
-- public.lfg_programs and public.user_role()).
--
-- Two new tables, both purely additive -- no existing table/column is
-- touched:
--
-- 1. lfg_program_report_recipients -- who gets the daily "LFG Connect
--    Updates" Excel report for a given seasonal Program. Configurable
--    per program (not a fixed list, not derived from lfg_partners),
--    per the user's explicit choice. Internal MMDI config, staff-only
--    -- partners never see or manage this list.
--
-- 2. lfg_program_report_sends -- an audit log of every report actually
--    sent (daily cron or manual "Send Now"), so staff can see when the
--    last send happened, to whom, how many rows, and whether it failed.
-- ============================================================

create table if not exists public.lfg_program_report_recipients (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.lfg_programs(id) on delete cascade,
  email text not null,
  name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists lfg_program_report_recipients_program_id_idx
  on public.lfg_program_report_recipients(program_id);

-- Avoid silently duplicating the same address on the same program (a
-- second insert with a different casing/whitespace is still allowed --
-- this only blocks an exact repeat, which is the common mis-click case).
create unique index if not exists lfg_program_report_recipients_program_email_idx
  on public.lfg_program_report_recipients(program_id, email);

alter table public.lfg_program_report_recipients enable row level security;

drop policy if exists lfg_program_report_recipients_all_staff on public.lfg_program_report_recipients;
create policy lfg_program_report_recipients_all_staff on public.lfg_program_report_recipients
  for all to authenticated
  using (public.user_role() in ('admin', 'editor'))
  with check (public.user_role() in ('admin', 'editor'));

-- No partner-facing policy at all -- lfg_partner_users has no grant here,
-- same as lfg_partners itself. Partners never query this table.

create table if not exists public.lfg_program_report_sends (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.lfg_programs(id) on delete cascade,
  sent_at timestamptz not null default now(),
  recipient_emails text[] not null default '{}',
  row_count integer,
  status text not null default 'sent' check (status in ('sent', 'failed', 'skipped_no_recipients')),
  error text,
  triggered_by text not null default 'cron' check (triggered_by in ('cron', 'manual')),
  created_by uuid references auth.users(id)
);

create index if not exists lfg_program_report_sends_program_id_idx
  on public.lfg_program_report_sends(program_id, sent_at desc);

alter table public.lfg_program_report_sends enable row level security;

drop policy if exists lfg_program_report_sends_select_staff on public.lfg_program_report_sends;
create policy lfg_program_report_sends_select_staff on public.lfg_program_report_sends
  for select to authenticated
  using (public.user_role() in ('admin', 'editor'));

-- Inserts to the send-log come from the service-role key (cron route) or
-- an authenticated staff member hitting "Send Now" -- either way the
-- app writes it via createRouteSupabaseClient bound to the calling
-- user's own session for the manual route, and the cron route uses
-- CRON_SECRET-gated service-role access which bypasses RLS entirely, so
-- no separate insert policy for staff is strictly required. Added
-- anyway so a staff-authenticated insert never silently 403s if the
-- manual route is ever changed to use the user's own session for the
-- write.
drop policy if exists lfg_program_report_sends_insert_staff on public.lfg_program_report_sends;
create policy lfg_program_report_sends_insert_staff on public.lfg_program_report_sends
  for insert to authenticated
  with check (public.user_role() in ('admin', 'editor'));
