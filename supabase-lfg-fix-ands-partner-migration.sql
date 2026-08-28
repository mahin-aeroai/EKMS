-- ============================================================
-- LFG Connect: fix "I&S" Installation Partner matching (IandS)
-- ============================================================
--
-- The original Permanent Sites migration looked up Installation Team =
-- "I&S" against lfg_partners.name with an EXACT (case-insensitive) match.
-- Per your note, the partner is actually on file as "IandS" (or some
-- other spacing/ampersand variant) -- so that exact match silently found
-- nothing and left partner_id untouched for every I&S site, which is why
-- Status Sheet still shows them Unassigned.
--
-- Fix: match on a NORMALIZED form instead of an exact string --
-- uppercase, "&" turned into "AND", then every non-alphanumeric
-- character (spaces, periods, etc.) stripped. "I&S", "IandS", "I & S",
-- "I and S", and "I.A.S" all normalize to the same "IANDS", so whichever
-- exact spelling is actually stored in lfg_partners.name still matches.
--
-- Scope: the 103 sites from the original "LFG 2026: Permanent Sites2.xlsx"
-- workbook whose Installation Team was "I&S" (matched by SFO ID, same as
-- that original migration -- all 103 have a non-null SFO ID in the source
-- sheet). MMDI-installed sites are out of scope here, unchanged as
-- before.
--
-- HOW TO RUN: paste into the Supabase SQL Editor.
--   1. Run "STEP 1 -- CHECK THE PARTNER MATCH" first. It should return
--      exactly one row -- the lfg_partners row that "IandS"/"I&S"
--      normalizes to, and how many sites currently sit at partner_id is
--      null among these 103. If it returns ZERO rows, the partner isn't
--      named anything close to "I&S"/"IandS" in lfg_partners at all --
--      stop and check the actual name in the Partners page before going
--      further (the UPDATE below would then match nothing, same failure
--      as before, just more visibly this time).
--   2. If step 1 looks right, run "STEP 2 -- UPDATE" below it.

-- ============================================================
-- STEP 1 -- CHECK THE PARTNER MATCH (run this first)
-- ============================================================
with target_sfo_ids(sfo_id) as (
  values
    ('825652'),
    ('820439'),
    ('1300789'),
    ('1997364'),
    ('1710313'),
    ('818674'),
    ('1639359'),
    ('841510'),
    ('3561342'),
    ('389086'),
    ('3901876'),
    ('3471560'),
    ('3579615'),
    ('1697008'),
    ('1710356'),
    ('1676390'),
    ('1345252'),
    ('1346259'),
    ('1589432'),
    ('1551107'),
    ('1565576'),
    ('1341397'),
    ('1635603'),
    ('2370346'),
    ('3334451'),
    ('3035986'),
    ('3103405'),
    ('3385941'),
    ('1710842'),
    ('3419538'),
    ('3471943'),
    ('1533313'),
    ('1635608'),
    ('1533290'),
    ('1588150'),
    ('1735046'),
    ('3480701'),
    ('1697001'),
    ('3477115'),
    ('3546076'),
    ('3781908'),
    ('3677885'),
    ('3677890'),
    ('3637782'),
    ('3672236'),
    ('3608643'),
    ('3565782'),
    ('3733985'),
    ('3720508'),
    ('3677889'),
    ('1600026'),
    ('3766657'),
    ('3730068'),
    ('3746352'),
    ('3844809'),
    ('3966940'),
    ('3947316'),
    ('3966944'),
    ('3952297'),
    ('3970650'),
    ('3973670'),
    ('4001404'),
    ('3970649'),
    ('4001405'),
    ('4036335'),
    ('4034664'),
    ('4034663'),
    ('1710849'),
    ('4006990'),
    ('4057048'),
    ('1710843'),
    ('4034662'),
    ('4033645'),
    ('4081607'),
    ('4049086'),
    ('4064149'),
    ('4094043'),
    ('4064148'),
    ('4145424'),
    ('4147785'),
    ('4006988'),
    ('3981506'),
    ('4006989'),
    ('4094042'),
    ('4151858'),
    ('4106601'),
    ('4013982'),
    ('3598599'),
    ('4195324'),
    ('4203387'),
    ('4033662'),
    ('4261142'),
    ('3638797'),
    ('4332656'),
    ('1533301'),
    ('4341261'),
    ('4227983'),
    ('1565561'),
    ('2150127'),
    ('984562'),
    ('1721270'),
    ('1721272'),
    ('1528172')
)
select
  p.id as partner_id,
  p.name as partner_name_on_file,
  (select count(*) from target_sfo_ids t join public.lfg_sites s on s.sfo_id = t.sfo_id) as matched_sites,
  (select count(*) from target_sfo_ids t join public.lfg_sites s on s.sfo_id = t.sfo_id where s.partner_id is null) as currently_unassigned
from public.lfg_partners p
where regexp_replace(upper(replace(p.name, '&', 'AND')), '[^A-Z0-9]', '', 'g') = 'IANDS';

-- ============================================================
-- STEP 2 -- UPDATE (run once step 1 shows the right partner)
-- ============================================================
with target_sfo_ids(sfo_id) as (
  values
    ('825652'),
    ('820439'),
    ('1300789'),
    ('1997364'),
    ('1710313'),
    ('818674'),
    ('1639359'),
    ('841510'),
    ('3561342'),
    ('389086'),
    ('3901876'),
    ('3471560'),
    ('3579615'),
    ('1697008'),
    ('1710356'),
    ('1676390'),
    ('1345252'),
    ('1346259'),
    ('1589432'),
    ('1551107'),
    ('1565576'),
    ('1341397'),
    ('1635603'),
    ('2370346'),
    ('3334451'),
    ('3035986'),
    ('3103405'),
    ('3385941'),
    ('1710842'),
    ('3419538'),
    ('3471943'),
    ('1533313'),
    ('1635608'),
    ('1533290'),
    ('1588150'),
    ('1735046'),
    ('3480701'),
    ('1697001'),
    ('3477115'),
    ('3546076'),
    ('3781908'),
    ('3677885'),
    ('3677890'),
    ('3637782'),
    ('3672236'),
    ('3608643'),
    ('3565782'),
    ('3733985'),
    ('3720508'),
    ('3677889'),
    ('1600026'),
    ('3766657'),
    ('3730068'),
    ('3746352'),
    ('3844809'),
    ('3966940'),
    ('3947316'),
    ('3966944'),
    ('3952297'),
    ('3970650'),
    ('3973670'),
    ('4001404'),
    ('3970649'),
    ('4001405'),
    ('4036335'),
    ('4034664'),
    ('4034663'),
    ('1710849'),
    ('4006990'),
    ('4057048'),
    ('1710843'),
    ('4034662'),
    ('4033645'),
    ('4081607'),
    ('4049086'),
    ('4064149'),
    ('4094043'),
    ('4064148'),
    ('4145424'),
    ('4147785'),
    ('4006988'),
    ('3981506'),
    ('4006989'),
    ('4094042'),
    ('4151858'),
    ('4106601'),
    ('4013982'),
    ('3598599'),
    ('4195324'),
    ('4203387'),
    ('4033662'),
    ('4261142'),
    ('3638797'),
    ('4332656'),
    ('1533301'),
    ('4341261'),
    ('4227983'),
    ('1565561'),
    ('2150127'),
    ('984562'),
    ('1721270'),
    ('1721272'),
    ('1528172')
),
matched_partner as (
  select id from public.lfg_partners
  where regexp_replace(upper(replace(name, '&', 'AND')), '[^A-Z0-9]', '', 'g') = 'IANDS'
  limit 1
)
update public.lfg_sites s
set partner_id = (select id from matched_partner)
from target_sfo_ids t
where s.sfo_id = t.sfo_id
  and exists (select 1 from matched_partner)
  and s.partner_id is distinct from (select id from matched_partner);
