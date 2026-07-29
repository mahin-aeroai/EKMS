-- customer_contacts: add mobile number + active/inactive (soft-deactivate,
-- not delete) so people who've left an account stay in the historical
-- record but stop showing up as a live contact anywhere in the app.
--
-- Note: customer_contacts' original CREATE TABLE isn't committed in this
-- repo (it predates the current convention of checking in schema files --
-- see PROJECT_STATUS.md). Every statement below is written defensively
-- (IF NOT EXISTS) so it's safe regardless of the table's exact existing
-- shape, matching every other migration in this project.
--
-- WHAT THIS ADDS
-- - phone: the contact's mobile number, free text (matches how gstin/
--   other identifiers are stored elsewhere in this app -- no format
--   validation, since Indian mobile numbers show up with/without +91,
--   spaces, etc. in real data).
-- - is_active: true by default (every existing contact stays visible).
--   Deactivating someone sets this to false instead of deleting their
--   row -- keeps them in the Customer workspace's history/timeline
--   context and any past comments/approvals that mention them, just
--   hidden from "who do I contact today" surfaces.
-- - deactivated_at: set the moment someone is deactivated (and cleared on
--   reactivation), so there's a real audit trail of when a contact left.
--
-- Idempotent: safe to re-run.

alter table public.customer_contacts
  add column if not exists phone text,
  add column if not exists is_active boolean not null default true,
  add column if not exists deactivated_at timestamptz;

create index if not exists customer_contacts_customer_id_active_idx
  on public.customer_contacts(customer_id, is_active);
