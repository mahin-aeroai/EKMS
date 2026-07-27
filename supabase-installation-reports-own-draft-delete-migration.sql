-- MMDI ONE — Installation Reports: let a supervisor discard their own stuck drafts
-- Run this in the Supabase SQL Editor
-- (Project: mahin-aeroai's Project, https://vzyrvzgtjcodxkjydxxn.supabase.co).
--
-- WHY
-- installation_reports' existing delete policy (installation_reports_delete_by_role,
-- see supabase-installation-reports-schema.sql) is admin-only, matching every
-- other table's uniform role-based RLS. That's the right default, but it means
-- the mobile Reports list's Discard action (apps/mobile/app/(tabs)/reports.tsx)
-- -- for a report that died mid-submit on a different device, with no local
-- draft left to resume from -- only works for admins. A field supervisor
-- hitting that case has no self-serve way to clear it.
--
-- This adds a second, narrower policy alongside the existing one (RLS
-- policies for the same command are OR'd together, so this is additive, not
-- a replacement): the report's own creator can delete it, but only while it's
-- still status = 'draft'. A submitted report can never be deleted this way --
-- created_by matching your own report is not enough once it's done; only the
-- admin-only policy reaches a submitted row.
--
-- Safe to re-run: `create policy` has no "if not exists", so this drops its
-- own policy first if present, then recreates it -- it does not touch
-- installation_reports_delete_by_role.

drop policy if exists "own draft reports deletable" on public.installation_reports;

create policy "own draft reports deletable"
on public.installation_reports for delete
using (created_by = auth.uid() and status = 'draft');

-- Verification queries — run after the statement above
-- 1. Confirm both delete policies are present:
--    select policyname, cmd, roles from pg_policies where tablename = 'installation_reports' and cmd = 'DELETE';
-- 2. Confirm a submitted report's own creator still cannot delete it
--    (expect 0 rows affected when run as that creator, not an error):
--    delete from installation_reports where id = '<a submitted report's id>';
