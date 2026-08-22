-- Adds a display-only "active" flag to profiles so the Administration page
-- can list who's deactivated without an Admin API round trip per row. The
-- REAL enforcement (blocking sign-in, invalidating an already-open session
-- on its very next request) is done separately, in the deactivate/reactivate
-- API route, via Supabase Auth's own ban_duration on the underlying
-- auth.users row (auth.admin.updateUserById) -- there is no RLS-governed way
-- to do that, same reasoning as auth.admin.createUser in supabase-admin.ts.
-- This column just lets the UI show status quickly and survives even if
-- someone updates it by hand; the route is what makes it true.
--
-- Run this once in the Supabase SQL Editor. Safe to re-run.

alter table public.profiles
  add column if not exists active boolean not null default true;

comment on column public.profiles.active is
  'Display flag mirroring auth.users.banned_until, kept in sync by /api/staff/[userId]/deactivate. False = sign-in blocked at the Supabase Auth layer.';
