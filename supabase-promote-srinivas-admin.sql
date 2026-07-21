-- MMDI ONE — promote srinivas@mmdi.in to admin
-- Run this in the Supabase SQL Editor
-- (Project: mahin-aeroai's Project, https://vzyrvzgtjcodxkjydxxn.supabase.co).
--
-- WHY
-- "+ Add new…" on the Creative picker (and any other insert/update/delete
-- anywhere in the app) failed with:
--   "new row violates row-level security policy for table
--   installation_report_creatives"
-- That's role-based RLS working as designed (see
-- supabase-role-based-rls-migration.sql) — every account defaults to
-- 'viewer' (read-only) unless promoted. Only m.nandipa@icloud.com was
-- bootstrapped as admin; srinivas@mmdi.in was never promoted (an earlier
-- attempt to bootstrap that email failed because no matching Supabase Auth
-- user existed yet at the time).
--
-- WHAT THIS DOES
-- Promotes srinivas@mmdi.in to 'admin' (read + insert/update/delete
-- everywhere, plus can manage other users' roles from the SQL editor).
-- Uses an insert ... on conflict so it works whether or not a profiles row
-- already exists for this email:
--   - If srinivas@mmdi.in has already signed into MMDI ONE at least once
--     (so a profiles row exists, currently 'viewer'), this updates it.
--   - If not, this creates the profiles row directly as 'admin' — no need
--     to sign in first.
-- Requires that a Supabase Auth user with this exact email already exists
-- (Authentication > Users in the Supabase dashboard). If it doesn't yet,
-- create/invite the user there first, then re-run this.
--
-- Safe to re-run.

insert into public.profiles (id, email, role)
select id, email, 'admin'
from auth.users
where email = 'srinivas@mmdi.in'
on conflict (id) do update set role = 'admin';

-- ============================================================
-- Verification
-- ============================================================

-- Should return one row with role = 'admin'. If it returns 0 rows, no
-- Supabase Auth user with this email exists yet — check
-- Authentication > Users in the Supabase dashboard for the exact email on
-- file (typos / different casing are the usual culprit).
select id, email, role, created_at from public.profiles where email = 'srinivas@mmdi.in';
