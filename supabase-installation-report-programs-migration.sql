-- MMDI ONE — Installation Report: Program Master (season programs)
-- Run this in the Supabase SQL Editor, after
-- supabase-installation-report-master-migration.sql.
--
-- WHAT THIS ADDS
-- "Program" turned out to mean two different things in this tool:
--   1. The store's own format program (APR, Mono AAR, Multi AAR, APP...)
--      — already captured on installation_report_stores.program, auto-filled
--      when you pick a store.
--   2. A season/rollout program (Fall 25, Spring 26...) — chosen once per
--      report, the same for every site in it. This migration adds the
--      small reusable list for #2.
--
-- installation_report_programs is managed from Manage Master Data
-- (Operations > Installation Report > Manage Master Data > Programs), same
-- as the Fixture Types / Materials / Sign Types lists, and can also be
-- added to inline from the report form's "+ Add new…" option.
--
-- Safe to re-run.

create table if not exists public.installation_report_programs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.installation_report_programs enable row level security;

drop policy if exists installation_report_programs_select_by_role on public.installation_report_programs;
drop policy if exists installation_report_programs_insert_by_role on public.installation_report_programs;
drop policy if exists installation_report_programs_update_by_role on public.installation_report_programs;
drop policy if exists installation_report_programs_delete_by_role on public.installation_report_programs;

create policy installation_report_programs_select_by_role on public.installation_report_programs
  for select to authenticated using (public.user_role() in ('admin', 'editor', 'viewer'));

create policy installation_report_programs_insert_by_role on public.installation_report_programs
  for insert to authenticated with check (public.user_role() in ('admin', 'editor'));

create policy installation_report_programs_update_by_role on public.installation_report_programs
  for update to authenticated using (public.user_role() in ('admin', 'editor')) with check (public.user_role() in ('admin', 'editor'));

create policy installation_report_programs_delete_by_role on public.installation_report_programs
  for delete to authenticated using (public.user_role() = 'admin');

-- A couple of starter values so the picker isn't empty — rename/delete/add
-- more from Manage Master Data.
insert into public.installation_report_programs (name) values
  ('Fall 25'),
  ('Spring 26')
on conflict (name) do nothing;

-- select * from public.installation_report_programs order by name;
