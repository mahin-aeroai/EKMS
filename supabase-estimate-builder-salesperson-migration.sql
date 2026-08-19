-- Estimate PDF's sign-off block used to be hardcoded to one person
-- ("Naresh Kumar D", see MMDI.signatoryName in
-- src/lib/estimateBuilder/pdf.ts) regardless of who actually built the
-- estimate. Removes that default and lets each estimate carry its own
-- sales person's business-card details (name, designation, mobile,
-- email), printed directly in the PDF sign-off instead of a generic name
-- under a blank signature gap.
--
-- Snapshotted as plain text on the estimate (same convention as
-- customer_address/customer_gstin/attention_person) rather than a live FK
-- to public.employees -- so a PDF re-downloaded months later still shows
-- exactly what it showed on save, even if that employee's phone/email/
-- designation changes later or they leave the company.
--
-- Safe to re-run.

alter table public.estimates
  add column if not exists salesperson_name text,
  add column if not exists salesperson_designation text,
  add column if not exists salesperson_phone text,
  add column if not exists salesperson_email text;
