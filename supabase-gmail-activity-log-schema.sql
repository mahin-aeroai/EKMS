-- MMDI ONE — Gmail integration: audit log
-- Run this in the Supabase SQL Editor
-- (Project: mahin-aeroai's Project, https://vzyrvzgtjcodxkjydxxn.supabase.co).
--
-- Implements gmail-plan-v2.md section 8 (step 5 of section 10).
--
-- WHAT THIS LOGS, AND WHY NOT MORE
-- Action + parameters only -- who searched what label for what terms, how
-- many hits came back. NEVER the message contents, and never the excerpt
-- text search_email returns to the model. The whole point of this table is
-- to answer "who searched what, and what drafts were created for whom"
-- without creating a second copy of the mail sitting in Postgres. For a
-- system holding IKEA and Apple correspondence, that distinction is the
-- actual point of the table, not an afterthought.
--
-- RLS
-- Insert: the calling user's own row only (the copilot route runs as the
-- caller, via createRouteSupabaseClient -- not a service-role client -- so
-- the insert itself must satisfy RLS as that user). Select: admin only --
-- this is activity/oversight data, not a business record every role should
-- browse, unlike the uniform admin/editor/viewer SELECT pattern the rest of
-- the app uses. Deliberately no update or delete policy at all: an audit
-- trail that can be edited or erased by the people it logs isn't an audit
-- trail.
--
-- Safe to re-run: create table/policy both guard against already existing.

create table if not exists public.gmail_activity_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id),
  action     text not null check (action in ('search', 'draft')),
  query      text,                   -- search terms, or null for draft
  label      text,                   -- the label searched, or null meaning "all allow-listed labels"
  recipient  text,                   -- for drafts (not used yet -- draft_email is out of scope for this pass)
  hit_count  integer,
  created_at timestamptz not null default now()
);

alter table public.gmail_activity_log enable row level security;

drop policy if exists gmail_activity_log_insert_own on public.gmail_activity_log;
create policy gmail_activity_log_insert_own on public.gmail_activity_log
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists gmail_activity_log_select_admin on public.gmail_activity_log;
create policy gmail_activity_log_select_admin on public.gmail_activity_log
  for select to authenticated
  using (public.user_role() = 'admin');

create index if not exists gmail_activity_log_user_id_idx on public.gmail_activity_log(user_id);
create index if not exists gmail_activity_log_created_at_idx on public.gmail_activity_log(created_at);

-- ============================================================
-- Verification queries — run after the statements above
-- ============================================================

-- 1. Confirm the table + RLS are present:
--    select relname, relrowsecurity from pg_class where relname = 'gmail_activity_log';
--    select policyname, cmd, qual from pg_policies where tablename = 'gmail_activity_log';

-- 2. After running a real search_email call, confirm a row landed with no
--    message content in it:
--    select user_id, action, query, label, hit_count, created_at from public.gmail_activity_log order by created_at desc limit 5;
