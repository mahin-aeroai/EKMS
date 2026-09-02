-- LFG Connect: let partners use the Site Survey Report Creator
-- (2 Sept 2026 -- see PROJECT_STATUS.md and
--  /root/.claude/plans/reactive-singing-abelson.md)
--
-- Run AFTER both supabase-lfg-site-management-schema.sql (needs
-- lfg_partner_id(), is_lfg_partner_user(), is_mmdi_staff(), lfg_sites)
-- and supabase-site-survey-reports-schema.sql (needs the base tables).
--
-- WHAT THIS ADDS
-- 1. A nullable site_id FK on site_survey_reports: a report is either
--    freestanding (drafted before any site exists -- the partner
--    "create a new site from this survey" case) or attached to a real
--    site once one is created/matched.
-- 2. New, ADDITIVE partner-scoped RLS policies on site_survey_reports and
--    site_survey_photos, alongside the existing staff role-based ones
--    (site_survey_reports_select_by_role etc, from
--    supabase-site-survey-reports-schema.sql) -- Postgres OR's multiple
--    permissive policies for the same command together, so this does not
--    touch or replace anything staff already has.
--
-- Ownership model: a partner can see/touch a report if EITHER they
-- created it (created_by = auth.uid(), covers freestanding drafts with
-- site_id still null) OR it's attached to one of their own sites (via
-- lfg_sites.partner_id). No DELETE policy for partners here -- deletion
-- stays admin-only (site_survey_reports_delete_by_role) plus the
-- existing own-draft-delete policy
-- (supabase-site-survey-reports-own-draft-delete-migration.sql, already
-- covers "my own still-draft report" for any authenticated user,
-- partners included, so nothing new is needed on that front).
--
-- Safe to re-run: add column if not exists; policies dropped and
-- recreated by name.

-- ============================================================
-- STEP 1 — nullable FK from site_survey_reports to lfg_sites
-- ============================================================

alter table public.site_survey_reports
  add column if not exists site_id uuid references public.lfg_sites(id);

create index if not exists site_survey_reports_site_id_idx
  on public.site_survey_reports(site_id);

-- ============================================================
-- STEP 2 — partner RLS on site_survey_reports
-- ============================================================

drop policy if exists site_survey_reports_select_partner on public.site_survey_reports;
drop policy if exists site_survey_reports_insert_partner on public.site_survey_reports;
drop policy if exists site_survey_reports_update_partner on public.site_survey_reports;

create policy site_survey_reports_select_partner on public.site_survey_reports
  for select to authenticated
  using (
    public.is_lfg_partner_user() and (
      created_by = auth.uid()
      or (site_id is not null and exists (
        select 1 from public.lfg_sites s where s.id = site_survey_reports.site_id and s.partner_id = public.lfg_partner_id()
      ))
    )
  );

create policy site_survey_reports_insert_partner on public.site_survey_reports
  for insert to authenticated
  with check (
    public.is_lfg_partner_user()
    and created_by = auth.uid()
    and (site_id is null or exists (
      select 1 from public.lfg_sites s where s.id = site_survey_reports.site_id and s.partner_id = public.lfg_partner_id()
    ))
  );

create policy site_survey_reports_update_partner on public.site_survey_reports
  for update to authenticated
  using (
    public.is_lfg_partner_user() and (
      created_by = auth.uid()
      or (site_id is not null and exists (
        select 1 from public.lfg_sites s where s.id = site_survey_reports.site_id and s.partner_id = public.lfg_partner_id()
      ))
    )
  )
  with check (
    public.is_lfg_partner_user() and (
      created_by = auth.uid()
      or (site_id is not null and exists (
        select 1 from public.lfg_sites s where s.id = site_survey_reports.site_id and s.partner_id = public.lfg_partner_id()
      ))
    )
  );

-- ============================================================
-- STEP 3 — partner RLS on site_survey_photos, joined through report_id
-- ============================================================

drop policy if exists site_survey_photos_select_partner on public.site_survey_photos;
drop policy if exists site_survey_photos_insert_partner on public.site_survey_photos;
drop policy if exists site_survey_photos_update_partner on public.site_survey_photos;
drop policy if exists site_survey_photos_delete_partner on public.site_survey_photos;

create policy site_survey_photos_select_partner on public.site_survey_photos
  for select to authenticated
  using (exists (
    select 1 from public.site_survey_reports r
    where r.id = site_survey_photos.report_id
      and public.is_lfg_partner_user()
      and (r.created_by = auth.uid() or (r.site_id is not null and exists (
        select 1 from public.lfg_sites s where s.id = r.site_id and s.partner_id = public.lfg_partner_id()
      )))
  ));

create policy site_survey_photos_insert_partner on public.site_survey_photos
  for insert to authenticated
  with check (exists (
    select 1 from public.site_survey_reports r
    where r.id = site_survey_photos.report_id
      and public.is_lfg_partner_user()
      and (r.created_by = auth.uid() or (r.site_id is not null and exists (
        select 1 from public.lfg_sites s where s.id = r.site_id and s.partner_id = public.lfg_partner_id()
      )))
  ));

create policy site_survey_photos_update_partner on public.site_survey_photos
  for update to authenticated
  using (exists (
    select 1 from public.site_survey_reports r
    where r.id = site_survey_photos.report_id
      and public.is_lfg_partner_user()
      and (r.created_by = auth.uid() or (r.site_id is not null and exists (
        select 1 from public.lfg_sites s where s.id = r.site_id and s.partner_id = public.lfg_partner_id()
      )))
  ));

create policy site_survey_photos_delete_partner on public.site_survey_photos
  for delete to authenticated
  using (exists (
    select 1 from public.site_survey_reports r
    where r.id = site_survey_photos.report_id
      and public.is_lfg_partner_user()
      and (r.created_by = auth.uid() or (r.site_id is not null and exists (
        select 1 from public.lfg_sites s where s.id = r.site_id and s.partner_id = public.lfg_partner_id()
      )))
  ));

-- ============================================================
-- Verification queries — run after the statements above
-- ============================================================

-- 1. Confirm the column exists:
--    select column_name from information_schema.columns
--    where table_name = 'site_survey_reports' and column_name = 'site_id';

-- 2. Confirm all 7 new policies are present:
--    select policyname, cmd from pg_policies
--    where tablename in ('site_survey_reports', 'site_survey_photos')
--      and policyname like '%_partner';
