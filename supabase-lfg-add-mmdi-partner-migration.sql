-- ============================================================
-- LFG Connect — Add MMDI as a real Installation Partner
-- ============================================================
--
-- Context: MMDI sites have never had a partner_id set, by original
-- design — MMDI is the platform's own in-house install team, not an
-- external company, so it was never given a row in lfg_partners.
-- That means MMDI sites never show or filter as an "Installation
-- Partner" anywhere in LFG Connect (Status Sheet, Site Master),
-- while I&S-installed sites do.
--
-- User decision: add MMDI as a real row in lfg_partners (same as
-- I&S) and assign it to every MMDI-installed site, purely as a
-- label. This has no portal-login implications — no row is added to
-- lfg_partner_users or lfg_partner_invited_emails, so MMDI gets no
-- partner-side portal access as a result of this migration.
--
-- Scope: the 53 SFO IDs below are every install_team == 'MMDI' row
-- from the original "LFG 2026: Permanent Sites2.xlsx" workbook (the
-- same 156-row source used for the I&S migration and the earlier
-- Permanent Sites refresh). All 53 have an SFO ID (0 missing), so
-- this migration matches by sfo_id, same as the I&S fix.
--
-- Safety:
--  - STEP 1 inserts the "MMDI" partner row only if a partner with
--    that normalized name does not already exist (same normalized
--    match used for I&S/IandS, in case "MMDI" is already present
--    under a different spelling) — safe to re-run.
--  - STEP 2 is a PREVIEW: run this first and check the numbers
--    before running STEP 3.
--  - STEP 3 only touches partner_id for the listed sfo_ids, and only
--    when partner_id is currently different from the MMDI partner's
--    id — safe to re-run, will not clobber a site someone has since
--    manually reassigned to a different partner.
--
-- ============================================================

-- ============================================================
-- STEP 1 — create the MMDI partner row (idempotent)
-- ============================================================

insert into public.lfg_partners (name)
select 'MMDI'
where not exists (
  select 1 from public.lfg_partners
  where regexp_replace(upper(name), '[^A-Z0-9]', '', 'g') = 'MMDI'
);

-- ============================================================
-- STEP 2 — PREVIEW (run this first, check before STEP 3)
-- ============================================================

with target_sfo_ids(sfo_id) as (
  values
  ('1606231'),
  ('1616817'),
  ('3033485'),
  ('727945'),
  ('544958'),
  ('3203628'),
  ('3219448'),
  ('1697010'),
  ('1661448'),
  ('1341385'),
  ('1531166'),
  ('1784220'),
  ('1656917'),
  ('1696992'),
  ('1341386'),
  ('1110206'),
  ('1696991'),
  ('1635604'),
  ('3458714'),
  ('1341387'),
  ('1635602'),
  ('1657381'),
  ('3593480'),
  ('435047'),
  ('3579614'),
  ('3604316'),
  ('2067885'),
  ('3966945'),
  ('3966947'),
  ('4014182'),
  ('4007522'),
  ('3994349'),
  ('4041810'),
  ('4041814'),
  ('4057046'),
  ('4044737'),
  ('4041811'),
  ('4038163'),
  ('4138055'),
  ('4151244'),
  ('4151243'),
  ('4206436'),
  ('4206435'),
  ('4227976'),
  ('4227978'),
  ('4227979'),
  ('4227977'),
  ('4227980'),
  ('4049085'),
  ('3759017'),
  ('4357051'),
  ('2150126'),
  ('1603819')
),
matched_partner as (
  select id, name from public.lfg_partners
  where regexp_replace(upper(name), '[^A-Z0-9]', '', 'g') = 'MMDI'
)
select
  (select count(*) from matched_partner) as mmdi_partner_rows_found,
  (select name from matched_partner limit 1) as mmdi_partner_name_on_file,
  (select count(*) from target_sfo_ids t join public.lfg_sites s on s.sfo_id = t.sfo_id) as matched_sites,
  (select count(*) from target_sfo_ids t join public.lfg_sites s on s.sfo_id = t.sfo_id where s.partner_id is null) as currently_unassigned,
  (select array_agg(t.sfo_id) from target_sfo_ids t left join public.lfg_sites s on s.sfo_id = t.sfo_id where s.id is null) as unmatched_sfo_ids;

-- ============================================================
-- STEP 3 — UPDATE (only run after checking STEP 2's output)
-- ============================================================

with target_sfo_ids(sfo_id) as (
  values
  ('1606231'),
  ('1616817'),
  ('3033485'),
  ('727945'),
  ('544958'),
  ('3203628'),
  ('3219448'),
  ('1697010'),
  ('1661448'),
  ('1341385'),
  ('1531166'),
  ('1784220'),
  ('1656917'),
  ('1696992'),
  ('1341386'),
  ('1110206'),
  ('1696991'),
  ('1635604'),
  ('3458714'),
  ('1341387'),
  ('1635602'),
  ('1657381'),
  ('3593480'),
  ('435047'),
  ('3579614'),
  ('3604316'),
  ('2067885'),
  ('3966945'),
  ('3966947'),
  ('4014182'),
  ('4007522'),
  ('3994349'),
  ('4041810'),
  ('4041814'),
  ('4057046'),
  ('4044737'),
  ('4041811'),
  ('4038163'),
  ('4138055'),
  ('4151244'),
  ('4151243'),
  ('4206436'),
  ('4206435'),
  ('4227976'),
  ('4227978'),
  ('4227979'),
  ('4227977'),
  ('4227980'),
  ('4049085'),
  ('3759017'),
  ('4357051'),
  ('2150126'),
  ('1603819')
),
matched_partner as (
  select id from public.lfg_partners
  where regexp_replace(upper(name), '[^A-Z0-9]', '', 'g') = 'MMDI'
  limit 1
)
update public.lfg_sites s
set partner_id = (select id from matched_partner)
from target_sfo_ids t
where s.sfo_id = t.sfo_id
  and exists (select 1 from matched_partner)
  and s.partner_id is distinct from (select id from matched_partner);
