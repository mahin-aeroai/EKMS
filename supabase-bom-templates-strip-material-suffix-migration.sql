-- MMDI ONE -- BOM Master: strip the baked-in material name off every FG
-- code's description.
--
-- Every one of the 33 bom_templates rows (see supabase-cost-sheet-seed.sql)
-- was seeded as "<Product type> -  <Material>", e.g.
--   'Digital Solvent Backlit Fabric -  POLY FAB BL-250 '
-- The material half goes stale the moment someone picks a different
-- alternative material for that FG code's substrate line (see the material
-- alternatives feature -- bom_template_lines / bom_template_line_alternatives)
-- -- the BOM Master list keeps showing the ORIGINAL material name baked into
-- the header, even after the actual mapped material has been swapped. The
-- material a line is actually using already has its own, always-current
-- display inside each template's expanded row detail ("Mapped raw
-- material"), so nothing is lost by dropping it from the header text here.
--
-- Splits on the FIRST occurrence of " -  " (space, hyphen, TWO spaces) --
-- verified against all 33 seed rows as the consistent delimiter marking
-- where the material name begins, including the handful of descriptions
-- that have an earlier, unrelated single-space hyphen as part of the
-- product type itself (e.g. 'Promotional Flag DS - Xtra Large -  DS
-- Blockout Polyester Fabric' -- the FIRST " -  " match correctly lands on
-- the second dash, keeping "Promotional Flag DS - Xtra Large" intact).
--
-- Idempotent: rows without that delimiter (none currently, but safe for any
-- future FG code created without a material baked in) are left untouched.
update public.bom_templates
set description = trim(split_part(description, ' -  ', 1))
where description like '% -  %';
