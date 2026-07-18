-- MMDI ONE — Installation Report: per-site Fixture Type / Material / Sign
-- Type / Size table
-- Run this in the Supabase SQL Editor, after
-- supabase-installation-report-master-migration.sql.
--
-- WHY THIS REPLACES THE OLD default_fixture_type / default_material /
-- default_sign_type COLUMNS ON installation_report_stores
-- Those three columns (added by
-- supabase-installation-report-store-sites-migration.sql) assumed every
-- site at a multi-site store shared the same fixture/material/sign type.
-- Re-checking the original Apple LFG pricing sheet (this time keeping every
-- row instead of deduplicating by SFO ID) shows that's not true — 24 stores
-- have 2 or 3 sites, and each site row in the source sheet carries its own
-- Material and Width/Height. This table lets each site of a store carry
-- its own Fixture Type / Material / Sign Type / Size, and the Installation
-- Report form now auto-creates each site pre-filled from its own row here
-- (see supabase-installation-report-store-sites-import.sql for the actual
-- 181 rows) instead of copying one store-wide default onto every site.
--
-- Safe to re-run.

create table if not exists public.installation_report_store_sites (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.installation_report_stores(id) on delete cascade,
  site_index integer not null default 1,
  fixture_type text,
  material text,
  sign_type text,
  width_mm numeric,
  height_mm numeric,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (store_id, site_index)
);

alter table public.installation_report_store_sites enable row level security;

drop policy if exists installation_report_store_sites_select_by_role on public.installation_report_store_sites;
drop policy if exists installation_report_store_sites_insert_by_role on public.installation_report_store_sites;
drop policy if exists installation_report_store_sites_update_by_role on public.installation_report_store_sites;
drop policy if exists installation_report_store_sites_delete_by_role on public.installation_report_store_sites;

create policy installation_report_store_sites_select_by_role on public.installation_report_store_sites
  for select to authenticated using (public.user_role() in ('admin', 'editor', 'viewer'));

create policy installation_report_store_sites_insert_by_role on public.installation_report_store_sites
  for insert to authenticated with check (public.user_role() in ('admin', 'editor'));

create policy installation_report_store_sites_update_by_role on public.installation_report_store_sites
  for update to authenticated using (public.user_role() in ('admin', 'editor')) with check (public.user_role() in ('admin', 'editor'));

create policy installation_report_store_sites_delete_by_role on public.installation_report_store_sites
  for delete to authenticated using (public.user_role() = 'admin');

-- ============================================================
-- Verification
-- ============================================================

-- select st.store_name, ss.site_index, ss.fixture_type, ss.material, ss.sign_type, ss.width_mm, ss.height_mm
-- from public.installation_report_store_sites ss
-- join public.installation_report_stores st on st.id = ss.store_id
-- order by st.store_name, ss.site_index
-- limit 20;
