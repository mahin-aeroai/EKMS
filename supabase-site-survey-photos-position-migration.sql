-- Site Survey Report: per-photo crop position ("picture placement options
-- to move a little here and there", Srinivas -- 4 Sept 2026).
--
-- Every photo box in the generated PDF (drawPhotoBox, pdfBuild.ts) and
-- every thumbnail on the Photos step (PhotosStep.tsx) crops with a
-- "cover" fit -- the image is scaled up until it fills the box on both
-- axes, and whichever axis overflows gets cropped off both edges evenly
-- (dead centre), same as CSS `object-fit: cover` with no
-- `object-position` set. There was previously no way to change WHICH part
-- of the photo stays visible when an important part of the site ends up
-- in the cropped-off portion.
--
-- crop_offset_x/crop_offset_y are 0-100, matching CSS `object-position`
-- percentage semantics exactly (so the same numbers drive both the
-- on-screen preview's `object-position` CSS and the PDF's crop math) --
-- 50/50 (the default) reproduces today's always-centred behaviour
-- exactly, so every existing photo renders identically until someone
-- actually repositions it. 0 = fully left/top edge of the photo kept
-- visible (the overflow crops off the right/bottom instead); 100 =
-- fully right/bottom edge kept visible.
--
-- Safe to re-run.

alter table public.site_survey_photos
  add column if not exists crop_offset_x numeric not null default 50,
  add column if not exists crop_offset_y numeric not null default 50;

alter table public.site_survey_photos
  drop constraint if exists site_survey_photos_crop_offset_x_range;
alter table public.site_survey_photos
  add constraint site_survey_photos_crop_offset_x_range check (crop_offset_x >= 0 and crop_offset_x <= 100);

alter table public.site_survey_photos
  drop constraint if exists site_survey_photos_crop_offset_y_range;
alter table public.site_survey_photos
  add constraint site_survey_photos_crop_offset_y_range check (crop_offset_y >= 0 and crop_offset_y <= 100);

-- Verification:
--   select column_name, column_default from information_schema.columns
--   where table_name = 'site_survey_photos' and column_name like 'crop_offset%';
