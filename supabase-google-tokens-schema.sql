-- MMDI ONE — Gmail integration: per-user OAuth token storage
-- Run this in the Supabase SQL Editor
-- (Project: mahin-aeroai's Project, https://vzyrvzgtjcodxkjydxxn.supabase.co).
--
-- Implements gmail-plan-v2.md sections 5 and 6 (steps 1-3 of section 10;
-- search_email/draft_email and the audit log are NOT part of this file).
--
-- PER-USER, NOT DOMAIN-WIDE DELEGATION
-- Every row is one person's own Gmail refresh token. There is no service
-- account impersonating the domain. A breach of this table exposes only
-- whoever's row leaked, and everyone can revoke their own access.
--
-- WHY A VAULT_SECRET_ID COLUMN, NOT A refresh_token COLUMN
-- The plan's own draft schema names the column `refresh_token` with a
-- comment "via Supabase Vault, not plaintext" -- in current Supabase Vault,
-- that means storing a UUID that points at an encrypted row in
-- vault.secrets, not the token itself in this table at all. The actual
-- column here is `vault_secret_id`; the *token* never touches
-- public.google_tokens.
--
-- WHY THREE SECURITY DEFINER WRAPPER FUNCTIONS INSTEAD OF DIRECT VAULT ACCESS
-- vault.create_secret / vault.update_secret ship with ALL privileges
-- revoked from PUBLIC (see supabase/vault's own install SQL) -- an
-- authenticated client cannot call them directly no matter what RLS says,
-- and vault.decrypted_secrets is a decrypt-on-read view that must not be
-- exposed wholesale. The three functions below run as their (superuser)
-- owner, bypassing that restriction deliberately, but every one of them
-- reads/writes ONLY the row matching auth.uid() -- there is no parameter
-- that lets a caller name a different user's row. That self-scoping is
-- the actual security boundary here, not the RLS policy (which only
-- covers plain SELECT).
--
-- Safe to re-run: create table/policy/function all guard against already
-- existing.

create extension if not exists supabase_vault;

-- ============================================================
-- STEP 1 — table
-- ============================================================

create table if not exists public.google_tokens (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  vault_secret_id uuid not null references vault.secrets(id) on delete cascade,
  email           text not null,
  scopes          text[] not null,
  connected_at    timestamptz not null default now(),
  last_used_at    timestamptz
);

alter table public.google_tokens enable row level security;

drop policy if exists google_tokens_select_own on public.google_tokens;
create policy google_tokens_select_own on public.google_tokens
  for select to authenticated
  using (user_id = auth.uid());

-- Deliberately no insert/update/delete policy for `authenticated`. RLS
-- default-denies any command with no matching policy, so direct writes are
-- impossible from the client; every write goes through the three functions
-- below, which enforce auth.uid() themselves rather than trusting RLS to
-- catch a caller writing someone else's vault_secret_id.

-- ============================================================
-- STEP 2 — SECURITY DEFINER wrapper functions
-- ============================================================

create or replace function public.google_tokens_set(
  p_refresh_token text,
  p_email text,
  p_scopes text[]
)
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_secret_id uuid;
begin
  select vault_secret_id into v_secret_id
  from public.google_tokens
  where user_id = auth.uid();

  if v_secret_id is not null then
    -- Reconnecting (e.g. after scopes changed, or a stale token) rotates
    -- the same vault.secrets row in place rather than creating an orphan.
    perform vault.update_secret(v_secret_id, p_refresh_token);
    update public.google_tokens
      set email = p_email, scopes = p_scopes, connected_at = now(), last_used_at = null
      where user_id = auth.uid();
  else
    v_secret_id := vault.create_secret(p_refresh_token, 'google_refresh_token:' || auth.uid()::text);
    insert into public.google_tokens (user_id, vault_secret_id, email, scopes)
      values (auth.uid(), v_secret_id, p_email, p_scopes);
  end if;
end;
$$;

revoke all on function public.google_tokens_set(text, text, text[]) from public;
grant execute on function public.google_tokens_set(text, text, text[]) to authenticated;

create or replace function public.google_tokens_get_refresh_token()
returns text
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_secret_id uuid;
  v_token text;
begin
  select vault_secret_id into v_secret_id
  from public.google_tokens
  where user_id = auth.uid();

  if v_secret_id is null then
    return null;
  end if;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where id = v_secret_id;

  update public.google_tokens set last_used_at = now() where user_id = auth.uid();

  return v_token;
end;
$$;

revoke all on function public.google_tokens_get_refresh_token() from public;
grant execute on function public.google_tokens_get_refresh_token() to authenticated;

create or replace function public.google_tokens_delete()
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_secret_id uuid;
begin
  select vault_secret_id into v_secret_id
  from public.google_tokens
  where user_id = auth.uid();

  delete from public.google_tokens where user_id = auth.uid();

  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;
end;
$$;

revoke all on function public.google_tokens_delete() from public;
grant execute on function public.google_tokens_delete() to authenticated;

-- ============================================================
-- Verification queries — run after the statements above
-- ============================================================

-- 1. Confirm the table + RLS are present:
--    select relname, relrowsecurity from pg_class where relname = 'google_tokens';
--    select policyname, cmd, qual from pg_policies where tablename = 'google_tokens';

-- 2. Confirm the plaintext refresh token is NOT readable through the table
--    itself (should return only vault_secret_id, a uuid, never the token):
--    select * from public.google_tokens;

-- 3. Confirm the three functions exist and are owned by a role that can
--    actually reach the vault schema (should NOT be `authenticated`):
--    select proname, proowner::regrole from pg_proc
--      where proname in ('google_tokens_set', 'google_tokens_get_refresh_token', 'google_tokens_delete');
