-- MMDI ONE — fix "new row violates row-level security policy for table
-- sign_estimates" when generating a Sign Estimator cost sheet.
-- Run this in the Supabase SQL Editor
-- (Project: mahin-aeroai's Project, https://vzyrvzgtjcodxkjydxxn.supabase.co).
--
-- WHY THIS HAPPENS
-- supabase-sign-estimator-schema.sql gates sign_profiles / sign_estimates /
-- etc. behind TWO checks, both of which must pass to insert a row:
--   1. public.user_role() must be 'admin' or 'editor'          (role check)
--   2. public.user_has_group_access(array['customers'])         (group check)
-- The role check alone isn't enough — a user can be a full admin (see
-- supabase-promote-srinivas-admin.sql) and still get blocked here if their
-- profiles.allowed_groups column doesn't include 'customers'. That column
-- is a separate, later-added access-control layer (see
-- src/lib/UserGroupsContext.tsx / src/app/workspaces/administration/page.tsx)
-- that this schema also checks. Whichever account is signed in when this
-- error shows up is missing one or both of these.
--
-- STEP 1 below shows every user's current role + allowed_groups so you can
-- see exactly which account is affected and what's missing, before STEP 2
-- fixes it.
--
-- EASIER ALTERNATIVE: once your OWN account is already an admin (confirmed
-- via STEP 1), you can also fix this for any user from inside the app —
-- Administration workspace > Users > "Groups" column > tick "Customers" —
-- no SQL needed after that point. This file is for when you can't reach
-- that screen yet, or want to fix it in bulk.
--
-- Safe to re-run.

-- ============================================================
-- STEP 1 — see who's affected
-- ============================================================
select
  email,
  role,
  allowed_groups,
  (allowed_groups is null or 'customers' = any(allowed_groups)) as has_customers_access
from public.profiles
order by created_at;

-- ============================================================
-- STEP 2 — fix ONE account (edit the email below, then run)
-- ============================================================
-- Promotes to 'editor' (minimum needed to insert/update; use 'admin' instead
-- if this person should also be able to delete estimates / manage masters)
-- AND adds 'customers' to their allowed_groups without removing any other
-- group access they already have.

update public.profiles
set
  role = case when role = 'admin' then role else 'editor' end,
  allowed_groups = case
    when allowed_groups is null then null  -- already unrestricted (sees everything) — leave as is
    else array(select distinct unnest(allowed_groups || array['customers']))
  end
where email = 'srinivas@mmdi.in';  -- <<< change this email to whichever account hit the error

-- ============================================================
-- STEP 3 — verify
-- ============================================================
select email, role, allowed_groups from public.profiles where email = 'srinivas@mmdi.in';
