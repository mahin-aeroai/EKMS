-- Restrict new self-registrations (src/app/login/page.tsx, authView ===
-- "register", supabase.auth.signUp) to @mmdi.in email addresses.
--
-- This is a BEFORE INSERT trigger on auth.users, not just the client-side
-- check added alongside this migration -- the client check is only a fast,
-- friendly error message; a determined caller could still hit Supabase's
-- Auth REST API directly and skip the browser entirely. This trigger is
-- the actual enforcement and can't be bypassed that way, since Supabase
-- Auth itself inserts into auth.users to create any account, however it
-- was requested (self-registration, an admin using the dashboard's
-- Authentication -> Users -> Add user, an invite, etc.) -- all of those
-- go through this same insert and this same check.
--
-- Only fires on INSERT, so it never touches rows that already exist.
-- Existing accounts (srinivas@mmdi.in, mahin.nandipa@gmail.com,
-- m.nandipa@icloud.com, nandipa@icloud.com -- see PROJECT_STATUS.md) keep
-- working exactly as before, including the two that aren't @mmdi.in
-- addresses themselves. This only affects accounts created from here on.
--
-- To apply: paste this whole file into the Supabase dashboard's SQL
-- Editor for this project and run it. Nothing here needs the
-- Authentication -> Hooks toggle or any other dashboard configuration --
-- a plain trigger is enough.

create or replace function public.enforce_mmdi_email_domain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null and new.email !~* '@mmdi\.in$' then
    raise exception 'Only @mmdi.in email addresses can register for MMDI ONE.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_mmdi_email_domain_trigger on auth.users;

create trigger enforce_mmdi_email_domain_trigger
  before insert on auth.users
  for each row
  execute function public.enforce_mmdi_email_domain();
