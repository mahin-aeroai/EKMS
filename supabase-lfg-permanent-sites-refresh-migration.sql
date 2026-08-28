-- ============================================================
-- LFG Connect: bulk refresh from "LFG 2026: Permanent Sites2.xlsx"
-- ============================================================
--
-- Source: the "LFG 2026_ Permanent Sites2.xlsx" workbook (3 sheets --
-- APR +APP, Mono AAR Stores, Multi AAR -- 156 data rows total, no
-- duplicate SFO IDs across the three sheets). Matches each spreadsheet
-- row to its lfg_sites row by SFO ID (Apple ID/SFO ID column ->
-- lfg_sites.sfo_id) and refreshes State, Region, MAT Code, ASM Contact
-- name, ASM mobile number, and the Installation Party (partner_id) --
-- exactly the fields asked for.
--
-- lfg_sites had no State column at all before this file -- added below
-- (also added to the master schema's own CREATE TABLE + retrofit block,
-- right next to City/Region, so a fresh install matches this migration).
--
-- Cleanup applied while extracting the sheet (so a re-run of this exact
-- file is idempotent and safe):
--   * State: normalized casing ("MAHARASHTRA"/"Maharashtra" -> "Maharashtra"),
--     "J&amp;K" un-escaped to "J&K", and the one obvious typo
--     "Andhra Padesh" corrected to "Andhra Pradesh". NOTE: one row's State
--     is "Gangtok" in the source sheet -- that's a city in Sikkim, not a
--     state name, but left exactly as given rather than silently guessing
--     "Sikkim" for it; worth a manual look.
--   * Region: normalized casing ("NORTH"/"North" -> "North", etc.).
--   * MAT CODE: some cells had the same code repeated across multiple
--     lines within one cell (e.g. "BANFL" / "BANFL" stacked) --
--     deduplicated to one value; cells with two genuinely different codes
--     (e.g. a site with separate front/back panel materials) are kept as
--     both, joined with " / ".
--   * ASM Contact: the sheet's "ASM Contact" column packs three lines into
--     one cell -- name, then "# :phone", then an @apple.com email --
--     split into asm_name (the name) and asm_mobile (the phone number,
--     digits only). Only 6 distinct ASM contacts across all 156 rows.
--   * Installation Team ("I&S" or "MMDI" -- no other values appear) ->
--     Installation Party (partner_id): "I&S" is looked up by exact
--     case-insensitive name match against lfg_partners; "MMDI" rows leave
--     partner_id untouched (MMDI is the platform's own install team, not
--     an external partner row in lfg_partners -- there's nothing to
--     assign). If "I&S" doesn't match any lfg_partners.name exactly, that
--     row's partner_id is silently left unchanged too (COALESCE falls
--     back to the existing value) -- the verification SELECT below will
--     make that visible before you commit to the UPDATE.
--
-- Every SET uses COALESCE(new, existing) -- a row only overwrites a field
-- when the spreadsheet actually supplied a value for it, so this can't
-- accidentally null out something already on file that the sheet happened
-- to leave blank (nothing in this particular sheet was blank for
-- State/Region/MAT Code, and only 5 of 156 rows had no ASM Contact, but
-- the safety is there regardless).
--
-- HOW TO RUN: paste this whole file into the Supabase SQL Editor.
-- Run the "PREVIEW" query FIRST and check unmatched_sfo_ids /
-- partner_lookup_misses are both empty (or expected) before running the
-- "UPDATE" statement below it.

-- Adds the State column (city/state/region all sit on lfg_sites itself,
-- same as the other per-site fields this file updates).
alter table public.lfg_sites add column if not exists state text;

-- ============================================================
-- PREVIEW -- run this first, read the results, THEN run the UPDATE below
-- ============================================================
with updates(sfo_id, state, region, mat_code, asm_name, asm_mobile, partner_name) as (
  values
    ('825652', 'Maharashtra', 'West', 'BANFL', 'SashiKanth', '7893974646', 'I&S'),
    ('820439', 'Rajasthan', 'North', 'SAVFL', 'SashiKanth', '7893974646', 'I&S'),
    ('1300789', 'Karnataka', 'South', 'SAVFL', 'SashiKanth', '7893974646', 'I&S'),
    ('1606231', 'Andhra Pradesh', 'South', 'SAVFL', 'SashiKanth', '7893974646', null),
    ('1997364', 'Karnataka', 'South', 'SAVFL', 'SashiKanth', '7893974646', 'I&S'),
    ('1710313', 'Telangana', 'South', 'SAVFL', 'SashiKanth', '7893974646', 'I&S'),
    ('1616817', 'Gujarat', 'West', 'SAVFL', 'SashiKanth', '7893974646', null),
    ('818674', 'Gujarat', 'West', 'BANFL', 'SashiKanth', '7893974646', 'I&S'),
    ('1639359', 'Uttar Pradesh', 'North', 'SAVFL', 'SashiKanth', '7893974646', 'I&S'),
    ('3033485', 'Delhi', 'North', 'FABBLS', 'SashiKanth', '7893974646', null),
    ('727945', 'Tamil Nadu', 'South', 'BANBL', 'SashiKanth', '7893974646', null),
    ('544958', 'Telangana', 'South', 'FABBLS', 'SashiKanth', '7893974646', null),
    ('3203628', 'Gujarat', 'West', 'FABBLE', 'SashiKanth', '7893974646', null),
    ('841510', 'Punjab', 'North', 'BANBL', 'SashiKanth', '7893974646', 'I&S'),
    ('3561342', 'Uttar Pradesh', 'North', 'FABBLS', 'SashiKanth', '7893974646', 'I&S'),
    ('389086', 'Gujarat', 'West', 'FABBL', 'SashiKanth', '7893974646', 'I&S'),
    ('3219448', 'Tamil Nadu', 'South', 'FABBLS', 'SashiKanth', '7893974646', null),
    ('3901876', 'Tamil Nadu', 'South', 'FABBLE', 'SashiKanth', '7893974646', 'I&S'),
    ('3471560', 'Maharashtra', 'West', 'FABBLS', 'SashiKanth', '7893974646', 'I&S'),
    ('3579615', 'Karnataka', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1697008', 'Gujarat', 'West', 'BANFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1710356', 'Karnataka', 'South', 'SAVCL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1697010', 'Telangana', 'South', 'SAVFL', 'S Gnaanaprakash', '9894612179', null),
    ('1661448', 'Gujarat', 'West', 'BANFL', 'S Gnaanaprakash', '9894612179', null),
    ('1341385', 'Kerala', 'South', 'BANFL', 'S Gnaanaprakash', '9894612179', null),
    ('1531166', 'Kerala', 'South', 'SAVFL', 'S Gnaanaprakash', '9894612179', null),
    ('1676390', 'Punjab', 'North', 'BANFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1784220', 'Tamil Nadu', 'South', 'SAVFL', 'S Gnaanaprakash', '9894612179', null),
    ('1656917', 'Telangana', 'South', 'SAVFL', 'S Gnaanaprakash', '9894612179', null),
    ('1345252', 'Punjab', 'North', 'SAVFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1346259', 'Maharashtra', 'West', 'SAVFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1696992', 'Kerala', 'South', 'SAVFL', 'S Gnaanaprakash', '9894612179', null),
    ('1341386', 'Tamil Nadu', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', null),
    ('1589432', 'Karnataka', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1551107', 'Karnataka', 'South', 'BANFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1110206', 'Tamil Nadu', 'South', 'BANBL', 'S Gnaanaprakash', '9894612179', null),
    ('1565576', 'Uttar Pradesh', 'North', 'SAVFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1341397', 'Gujarat', 'West', 'SAVFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1635603', 'West Bengal', 'East', 'SAVFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('2370346', 'West Bengal', 'East', 'SAVCL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1696991', 'Karnataka', 'South', 'BANBL', 'S Gnaanaprakash', '9894612179', null),
    ('1635604', 'Tamil Nadu', 'South', 'BANBL', 'S Gnaanaprakash', '9894612179', null),
    ('3334451', 'Madhya Pradesh', 'West', 'SAVFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3035986', 'Karnataka', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3103405', 'Uttar Pradesh', 'North', 'SAVFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3385941', 'Assam', 'East', 'BANFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1710842', 'West Bengal', 'East', 'BANFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3419538', 'Haryana', 'North', 'ONEWA', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3458714', 'Tamil Nadu', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', null),
    ('3471943', 'Maharashtra', 'West', 'SAVFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1341387', 'Tamil Nadu', 'South', 'BANFL', 'S Gnaanaprakash', '9894612179', null),
    ('1533313', 'Kerala', 'South', 'BANFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1635602', 'Kerala', 'South', 'BANFL', 'S Gnaanaprakash', '9894612179', null),
    ('1657381', 'Puducherry', 'South', 'SAVFL', 'S Gnaanaprakash', '9894612179', null),
    ('1635608', 'Punjab', 'North', 'SAVFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1533290', 'Uttarakhand', 'North', 'SAVFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1588150', 'Uttar Pradesh', 'North', 'BANBL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1735046', 'Haryana', 'North', 'BANBL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3480701', 'Haryana', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1697001', 'Karnataka', 'South', 'SAVFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3477115', 'Punjab', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3546076', 'Haryana', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3593480', 'Odisha', 'East', 'BANBL', 'S Gnaanaprakash', '9894612179', null),
    ('435047', 'Karnataka', 'South', 'FABBL', 'S Gnaanaprakash', '9894612179', null),
    ('3781908', 'Gangtok', 'East', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3579614', 'Kerala', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', null),
    ('3604316', 'Andhra Pradesh', 'South', 'BANBL', 'S Gnaanaprakash', '9894612179', null),
    ('3677885', 'Haryana', 'North', 'SAVFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3677890', 'Delhi', 'North', 'FABBL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3637782', 'Kerala', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3672236', 'Haryana', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3608643', 'Punjab', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3565782', 'Odisha', 'East', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('2067885', 'Maharashtra', 'West', 'FABBLE', 'S Gnaanaprakash', '9894612179', null),
    ('3733985', 'Haryana', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3720508', 'West Bengal', 'East', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3677889', 'Kerala', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1600026', 'Maharashtra', 'West', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3766657', 'West Bengal', 'East', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3730068', 'Karnataka', 'South', 'BANFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3746352', 'Uttar Pradesh', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3844809', 'Kerala', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3966940', 'Uttar Pradesh', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3947316', 'Uttar Pradesh', 'North', 'BANBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3966944', 'Maharashtra', 'West', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3952297', 'West Bengal', 'East', 'BANFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3966945', 'Maharashtra', 'West', 'FABBLE', 'S Gnaanaprakash', '9894612179', null),
    ('3966947', 'Tamil Nadu', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', null),
    ('3970650', 'Haryana', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4014182', 'Maharashtra', 'West', 'FABBLE', 'S Gnaanaprakash', '9894612179', null),
    ('3973670', 'Punjab', 'North', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4007522', 'Kerala', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', null),
    ('3994349', 'Tamil Nadu', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', null),
    ('4001404', 'J&K', 'North', 'BANBLE / BANFLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3970649', 'Rajasthan', 'North', 'BANBLE / FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4001405', 'Rajasthan', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4036335', 'Kerala', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4034664', 'Rajasthan', 'North', 'BANBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4034663', 'Punjab', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1710849', 'Karnataka', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4006990', 'Assam', 'East', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4057048', 'Karnataka', 'South', 'FABBLSE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1710843', 'Bihar', 'East', 'FABBL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4034662', 'J&K', 'North', 'BANFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4033645', 'Madhya Pradesh', 'West', 'FABBLSE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4081607', 'Bihar', 'East', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4049086', 'Gujarat', 'West', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4041810', 'Tamil Nadu', 'South', 'FABBL', 'S Gnaanaprakash', '9894612179', null),
    ('4041814', 'Kerala', 'South', 'FABBL', 'S Gnaanaprakash', '9894612179', null),
    ('4064149', 'Rajasthan', 'North', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4094043', 'Rajasthan', 'North', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4064148', 'Uttar Pradesh', 'North', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4145424', 'Goa', 'West', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4147785', 'Maharashtra', 'West', 'FABBL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4006988', 'Jharkhand', 'East', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3981506', 'Maharashtra', 'West', 'FABBL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4057046', 'Kerala', 'South', 'FABBL', 'S Gnaanaprakash', '9894612179', null),
    ('4044737', 'Andhra Pradesh', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', null),
    ('4041811', 'Tamil Nadu', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', null),
    ('4038163', 'Andhra Pradesh', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', null),
    ('4006989', 'Assam', 'East', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4138055', 'Karnataka', 'South', 'FABBL', 'S Gnaanaprakash', '9894612179', null),
    ('4094042', 'Punjab', 'North', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4151858', 'Maharashtra', 'West', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4106601', 'Punjab', 'North', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4151244', 'Karnataka', 'South', 'FABBL', 'S Gnaanaprakash', '9894612179', null),
    ('4151243', 'Tamil Nadu', 'South', 'FABBL', 'S Gnaanaprakash', '9894612179', null),
    ('4013982', 'Arunachal Pradesh', 'East', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4206436', 'Puducherry', 'South', 'FABBL', 'S Gnaanaprakash', '9894612179', null),
    ('4206435', 'Andhra Pradesh', 'South', 'FABBL', 'S Gnaanaprakash', '9894612179', null),
    ('4227976', 'Tamil Nadu', 'South', 'FABBL', null, null, null),
    ('4227978', 'Telangana', 'South', 'FABBL', null, null, null),
    ('4227979', 'Telangana', 'South', 'FABBL', null, null, null),
    ('3598599', 'Madhya Pradesh', 'West', 'BANBL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4195324', 'Uttar Pradesh', 'North', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4203387', 'Delhi', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4033662', 'Uttar Pradesh', 'North', 'SAVFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4227977', 'Tamil Nadu', 'South', 'FABBL', null, null, null),
    ('4227980', 'Telangana', 'South', 'FABBL', null, null, null),
    ('4049085', 'Tamil Nadu', 'South', 'BANFL', 'S Gnaanaprakash', '9894612179', null),
    ('4261142', 'Rajasthan', 'North', 'BANFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3638797', 'Punjab', 'North', 'FABBL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4332656', 'Madhya Pradesh', 'West', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1533301', 'Haryana', 'North', 'FABBL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4341261', 'Madhya Pradesh', 'West', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4227983', 'Delhi', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3759017', 'Delhi', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', null),
    ('4357051', 'Telangana', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', null),
    ('2150126', 'Karnataka', 'South', 'SAVCL', 'VISHRUT DUBEY', '9986018313', null),
    ('1603819', 'Karnataka', 'South', 'SAVCL', 'VISHRUT DUBEY', '9986018313', null),
    ('1565561', 'Karnataka', 'South', 'SAVCL', 'BIPIN YOGESH', '7795191919', 'I&S'),
    ('2150127', 'Karnataka', 'South', 'SAVCL', 'VISHRUT DUBEY', '9986018313', 'I&S'),
    ('984562', 'Haryana', 'North', 'BANFL', 'VIVEK SINGH', '9999768004', 'I&S'),
    ('1721270', 'Haryana', 'North', 'BANFL', 'VIVEK SINGH', '9999768004', 'I&S'),
    ('1721272', 'Haryana', 'North', 'BANFL', 'VIVEK SINGH', '9999768004', 'I&S'),
    ('1528172', 'Punjab', 'North', 'BANFL', 'NIMISH METHI', '9828055106', 'I&S')
)
select
  (select array_agg(u.sfo_id) from updates u left join public.lfg_sites s on s.sfo_id = u.sfo_id where s.id is null) as unmatched_sfo_ids,
  (select array_agg(distinct u.partner_name) from updates u where u.partner_name is not null
     and not exists (select 1 from public.lfg_partners p where lower(trim(p.name)) = lower(trim(u.partner_name)))) as partner_lookup_misses,
  (select count(*) from updates u join public.lfg_sites s on s.sfo_id = u.sfo_id) as rows_that_will_update;

-- ============================================================
-- UPDATE -- run this once the preview above looks right
-- ============================================================
with updates(sfo_id, state, region, mat_code, asm_name, asm_mobile, partner_name) as (
  values
    ('825652', 'Maharashtra', 'West', 'BANFL', 'SashiKanth', '7893974646', 'I&S'),
    ('820439', 'Rajasthan', 'North', 'SAVFL', 'SashiKanth', '7893974646', 'I&S'),
    ('1300789', 'Karnataka', 'South', 'SAVFL', 'SashiKanth', '7893974646', 'I&S'),
    ('1606231', 'Andhra Pradesh', 'South', 'SAVFL', 'SashiKanth', '7893974646', null),
    ('1997364', 'Karnataka', 'South', 'SAVFL', 'SashiKanth', '7893974646', 'I&S'),
    ('1710313', 'Telangana', 'South', 'SAVFL', 'SashiKanth', '7893974646', 'I&S'),
    ('1616817', 'Gujarat', 'West', 'SAVFL', 'SashiKanth', '7893974646', null),
    ('818674', 'Gujarat', 'West', 'BANFL', 'SashiKanth', '7893974646', 'I&S'),
    ('1639359', 'Uttar Pradesh', 'North', 'SAVFL', 'SashiKanth', '7893974646', 'I&S'),
    ('3033485', 'Delhi', 'North', 'FABBLS', 'SashiKanth', '7893974646', null),
    ('727945', 'Tamil Nadu', 'South', 'BANBL', 'SashiKanth', '7893974646', null),
    ('544958', 'Telangana', 'South', 'FABBLS', 'SashiKanth', '7893974646', null),
    ('3203628', 'Gujarat', 'West', 'FABBLE', 'SashiKanth', '7893974646', null),
    ('841510', 'Punjab', 'North', 'BANBL', 'SashiKanth', '7893974646', 'I&S'),
    ('3561342', 'Uttar Pradesh', 'North', 'FABBLS', 'SashiKanth', '7893974646', 'I&S'),
    ('389086', 'Gujarat', 'West', 'FABBL', 'SashiKanth', '7893974646', 'I&S'),
    ('3219448', 'Tamil Nadu', 'South', 'FABBLS', 'SashiKanth', '7893974646', null),
    ('3901876', 'Tamil Nadu', 'South', 'FABBLE', 'SashiKanth', '7893974646', 'I&S'),
    ('3471560', 'Maharashtra', 'West', 'FABBLS', 'SashiKanth', '7893974646', 'I&S'),
    ('3579615', 'Karnataka', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1697008', 'Gujarat', 'West', 'BANFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1710356', 'Karnataka', 'South', 'SAVCL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1697010', 'Telangana', 'South', 'SAVFL', 'S Gnaanaprakash', '9894612179', null),
    ('1661448', 'Gujarat', 'West', 'BANFL', 'S Gnaanaprakash', '9894612179', null),
    ('1341385', 'Kerala', 'South', 'BANFL', 'S Gnaanaprakash', '9894612179', null),
    ('1531166', 'Kerala', 'South', 'SAVFL', 'S Gnaanaprakash', '9894612179', null),
    ('1676390', 'Punjab', 'North', 'BANFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1784220', 'Tamil Nadu', 'South', 'SAVFL', 'S Gnaanaprakash', '9894612179', null),
    ('1656917', 'Telangana', 'South', 'SAVFL', 'S Gnaanaprakash', '9894612179', null),
    ('1345252', 'Punjab', 'North', 'SAVFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1346259', 'Maharashtra', 'West', 'SAVFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1696992', 'Kerala', 'South', 'SAVFL', 'S Gnaanaprakash', '9894612179', null),
    ('1341386', 'Tamil Nadu', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', null),
    ('1589432', 'Karnataka', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1551107', 'Karnataka', 'South', 'BANFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1110206', 'Tamil Nadu', 'South', 'BANBL', 'S Gnaanaprakash', '9894612179', null),
    ('1565576', 'Uttar Pradesh', 'North', 'SAVFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1341397', 'Gujarat', 'West', 'SAVFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1635603', 'West Bengal', 'East', 'SAVFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('2370346', 'West Bengal', 'East', 'SAVCL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1696991', 'Karnataka', 'South', 'BANBL', 'S Gnaanaprakash', '9894612179', null),
    ('1635604', 'Tamil Nadu', 'South', 'BANBL', 'S Gnaanaprakash', '9894612179', null),
    ('3334451', 'Madhya Pradesh', 'West', 'SAVFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3035986', 'Karnataka', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3103405', 'Uttar Pradesh', 'North', 'SAVFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3385941', 'Assam', 'East', 'BANFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1710842', 'West Bengal', 'East', 'BANFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3419538', 'Haryana', 'North', 'ONEWA', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3458714', 'Tamil Nadu', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', null),
    ('3471943', 'Maharashtra', 'West', 'SAVFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1341387', 'Tamil Nadu', 'South', 'BANFL', 'S Gnaanaprakash', '9894612179', null),
    ('1533313', 'Kerala', 'South', 'BANFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1635602', 'Kerala', 'South', 'BANFL', 'S Gnaanaprakash', '9894612179', null),
    ('1657381', 'Puducherry', 'South', 'SAVFL', 'S Gnaanaprakash', '9894612179', null),
    ('1635608', 'Punjab', 'North', 'SAVFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1533290', 'Uttarakhand', 'North', 'SAVFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1588150', 'Uttar Pradesh', 'North', 'BANBL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1735046', 'Haryana', 'North', 'BANBL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3480701', 'Haryana', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1697001', 'Karnataka', 'South', 'SAVFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3477115', 'Punjab', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3546076', 'Haryana', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3593480', 'Odisha', 'East', 'BANBL', 'S Gnaanaprakash', '9894612179', null),
    ('435047', 'Karnataka', 'South', 'FABBL', 'S Gnaanaprakash', '9894612179', null),
    ('3781908', 'Gangtok', 'East', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3579614', 'Kerala', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', null),
    ('3604316', 'Andhra Pradesh', 'South', 'BANBL', 'S Gnaanaprakash', '9894612179', null),
    ('3677885', 'Haryana', 'North', 'SAVFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3677890', 'Delhi', 'North', 'FABBL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3637782', 'Kerala', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3672236', 'Haryana', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3608643', 'Punjab', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3565782', 'Odisha', 'East', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('2067885', 'Maharashtra', 'West', 'FABBLE', 'S Gnaanaprakash', '9894612179', null),
    ('3733985', 'Haryana', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3720508', 'West Bengal', 'East', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3677889', 'Kerala', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1600026', 'Maharashtra', 'West', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3766657', 'West Bengal', 'East', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3730068', 'Karnataka', 'South', 'BANFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3746352', 'Uttar Pradesh', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3844809', 'Kerala', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3966940', 'Uttar Pradesh', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3947316', 'Uttar Pradesh', 'North', 'BANBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3966944', 'Maharashtra', 'West', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3952297', 'West Bengal', 'East', 'BANFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3966945', 'Maharashtra', 'West', 'FABBLE', 'S Gnaanaprakash', '9894612179', null),
    ('3966947', 'Tamil Nadu', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', null),
    ('3970650', 'Haryana', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4014182', 'Maharashtra', 'West', 'FABBLE', 'S Gnaanaprakash', '9894612179', null),
    ('3973670', 'Punjab', 'North', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4007522', 'Kerala', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', null),
    ('3994349', 'Tamil Nadu', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', null),
    ('4001404', 'J&K', 'North', 'BANBLE / BANFLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3970649', 'Rajasthan', 'North', 'BANBLE / FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4001405', 'Rajasthan', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4036335', 'Kerala', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4034664', 'Rajasthan', 'North', 'BANBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4034663', 'Punjab', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1710849', 'Karnataka', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4006990', 'Assam', 'East', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4057048', 'Karnataka', 'South', 'FABBLSE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1710843', 'Bihar', 'East', 'FABBL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4034662', 'J&K', 'North', 'BANFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4033645', 'Madhya Pradesh', 'West', 'FABBLSE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4081607', 'Bihar', 'East', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4049086', 'Gujarat', 'West', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4041810', 'Tamil Nadu', 'South', 'FABBL', 'S Gnaanaprakash', '9894612179', null),
    ('4041814', 'Kerala', 'South', 'FABBL', 'S Gnaanaprakash', '9894612179', null),
    ('4064149', 'Rajasthan', 'North', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4094043', 'Rajasthan', 'North', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4064148', 'Uttar Pradesh', 'North', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4145424', 'Goa', 'West', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4147785', 'Maharashtra', 'West', 'FABBL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4006988', 'Jharkhand', 'East', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3981506', 'Maharashtra', 'West', 'FABBL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4057046', 'Kerala', 'South', 'FABBL', 'S Gnaanaprakash', '9894612179', null),
    ('4044737', 'Andhra Pradesh', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', null),
    ('4041811', 'Tamil Nadu', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', null),
    ('4038163', 'Andhra Pradesh', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', null),
    ('4006989', 'Assam', 'East', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4138055', 'Karnataka', 'South', 'FABBL', 'S Gnaanaprakash', '9894612179', null),
    ('4094042', 'Punjab', 'North', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4151858', 'Maharashtra', 'West', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4106601', 'Punjab', 'North', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4151244', 'Karnataka', 'South', 'FABBL', 'S Gnaanaprakash', '9894612179', null),
    ('4151243', 'Tamil Nadu', 'South', 'FABBL', 'S Gnaanaprakash', '9894612179', null),
    ('4013982', 'Arunachal Pradesh', 'East', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4206436', 'Puducherry', 'South', 'FABBL', 'S Gnaanaprakash', '9894612179', null),
    ('4206435', 'Andhra Pradesh', 'South', 'FABBL', 'S Gnaanaprakash', '9894612179', null),
    ('4227976', 'Tamil Nadu', 'South', 'FABBL', null, null, null),
    ('4227978', 'Telangana', 'South', 'FABBL', null, null, null),
    ('4227979', 'Telangana', 'South', 'FABBL', null, null, null),
    ('3598599', 'Madhya Pradesh', 'West', 'BANBL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4195324', 'Uttar Pradesh', 'North', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4203387', 'Delhi', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4033662', 'Uttar Pradesh', 'North', 'SAVFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4227977', 'Tamil Nadu', 'South', 'FABBL', null, null, null),
    ('4227980', 'Telangana', 'South', 'FABBL', null, null, null),
    ('4049085', 'Tamil Nadu', 'South', 'BANFL', 'S Gnaanaprakash', '9894612179', null),
    ('4261142', 'Rajasthan', 'North', 'BANFL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3638797', 'Punjab', 'North', 'FABBL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4332656', 'Madhya Pradesh', 'West', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('1533301', 'Haryana', 'North', 'FABBL', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4341261', 'Madhya Pradesh', 'West', 'FABBLE', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('4227983', 'Delhi', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', 'I&S'),
    ('3759017', 'Delhi', 'North', 'FABBLS', 'S Gnaanaprakash', '9894612179', null),
    ('4357051', 'Telangana', 'South', 'FABBLS', 'S Gnaanaprakash', '9894612179', null),
    ('2150126', 'Karnataka', 'South', 'SAVCL', 'VISHRUT DUBEY', '9986018313', null),
    ('1603819', 'Karnataka', 'South', 'SAVCL', 'VISHRUT DUBEY', '9986018313', null),
    ('1565561', 'Karnataka', 'South', 'SAVCL', 'BIPIN YOGESH', '7795191919', 'I&S'),
    ('2150127', 'Karnataka', 'South', 'SAVCL', 'VISHRUT DUBEY', '9986018313', 'I&S'),
    ('984562', 'Haryana', 'North', 'BANFL', 'VIVEK SINGH', '9999768004', 'I&S'),
    ('1721270', 'Haryana', 'North', 'BANFL', 'VIVEK SINGH', '9999768004', 'I&S'),
    ('1721272', 'Haryana', 'North', 'BANFL', 'VIVEK SINGH', '9999768004', 'I&S'),
    ('1528172', 'Punjab', 'North', 'BANFL', 'NIMISH METHI', '9828055106', 'I&S')
)
update public.lfg_sites s
set
  state = coalesce(u.state, s.state),
  region = coalesce(u.region, s.region),
  mat_code = coalesce(u.mat_code, s.mat_code),
  asm_name = coalesce(u.asm_name, s.asm_name),
  asm_mobile = coalesce(u.asm_mobile, s.asm_mobile),
  partner_id = coalesce(
    (select p.id from public.lfg_partners p where lower(trim(p.name)) = lower(trim(u.partner_name))),
    s.partner_id
  )
from updates u
where s.sfo_id = u.sfo_id;
