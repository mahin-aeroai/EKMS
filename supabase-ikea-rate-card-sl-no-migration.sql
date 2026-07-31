-- MMDI ONE — IKEA Rate Card: real Sl. No. backfill
--
-- ROOT CAUSE of "Product No. 51 in the PDF should have been 8" (WALLPAPER
-- AHD3223 line): ikea_rate_card was imported without the master sheet's
-- "Sl. No." column. The Estimate Builder's IKEA product picker queries the
-- table ordered alphabetically by product name (`.order("product")`) and
-- used to fall back to guessing Product No. from the row's position in
-- THAT alphabetical list -- so "WALLPAPER..." (near the end of the
-- alphabet) landed on 51 instead of its real master-sheet number, 8.
--
-- FIX: add a real sl_no column and backfill it from the master rate card
-- sheet (Scope / Material Category / Product / Description / UOM /
-- Revised Rate / Remarks, Sl. No. 1-51), matched on (product, description)
-- since product name alone isn't unique (e.g. "Frosted vinyl" appears
-- twice with different descriptions). The app-code change alongside this
-- migration makes the product picker use sl_no instead of list position.
--
-- Idempotent: safe to re-run.

alter table public.ikea_rate_card
  add column if not exists sl_no integer;

update public.ikea_rate_card set sl_no = 1  where product = 'Façade Banner' and description = 'Façade banner  SD FLEX - STAR BLACKOUT';
update public.ikea_rate_card set sl_no = 2  where product = 'Facade Banner Installation' and description = 'Façade Banner Installation';
update public.ikea_rate_card set sl_no = 3  where product = '440 GSM  Banner' and description = 'UV printing - Aisle banner, Parking billboards, Samosa banners';
update public.ikea_rate_card set sl_no = 4  where product = '12MM PAPER CORRUGATED SHEET' and description = 'UV print on 12MM paper board with die cut';
update public.ikea_rate_card set sl_no = 5  where product = 'Frosted vinyl' and description = 'UV Print on frosted film / die cut';
update public.ikea_rate_card set sl_no = 6  where product = 'SD VINYL MAGNETIC' and description = 'UV print - Magnetic vinyl with die cut';
update public.ikea_rate_card set sl_no = 7  where product = 'Frosted vinyl' and description = 'Frosted film on window';
update public.ikea_rate_card set sl_no = 8  where product = 'WALLPAPER AHD3223' and description = 'UV Print on Non-tearable wall graphic paper (including installation)';
update public.ikea_rate_card set sl_no = 9  where product = 'ART PAPER 300GSM DS' and description = 'Digital print - Buntings, danglers, A4';
update public.ikea_rate_card set sl_no = 10 where product = 'LG Floor Graphic Lamination Film Supply' and description = 'Material supply of LG Floor Graphic Lamination Film';
update public.ikea_rate_card set sl_no = 11 where product = 'Translite Film Supply' and description = 'Material supply of Translite Film';
update public.ikea_rate_card set sl_no = 12 where product = 'fabric print' and description = 'Print on fabric material';
update public.ikea_rate_card set sl_no = 13 where product = 'Aluminium backlight frame' and description = '50-70MM thin silver anodised Aluminium fabric frame';
update public.ikea_rate_card set sl_no = 14 where product = 'Vinyl Cardboard with laser Cut finish' and description = 'UV Print on SAV pasted on 2.5MM Paper Card Board with cut';
update public.ikea_rate_card set sl_no = 15 where product = 'Banner with Pipes' and description = 'PVC banner with square pipes';
update public.ikea_rate_card set sl_no = 16 where product = 'SD VINYL CLEAR 3M IJ8150 (Helmet Sticker)' and description = 'UV Print on 3M IJ8150 (Clear Vinyl)';
update public.ikea_rate_card set sl_no = 17 where product = 'Clip Frame Aluminium Size: A1' and description = 'Clip Frame Aluminium Size: A1';
update public.ikea_rate_card set sl_no = 18 where product = 'Clip Frame Aluminium Size: A2' and description = 'Clip Frame Aluminium Size: A2';
update public.ikea_rate_card set sl_no = 19 where product = 'Tag : Art Paper 300 GSM DS FSC Mix Credit; Size: 190x84 MM' and description = 'ag : Art Paper 300 GSM DS FSC Mix Credit; Size: 190x84 MM';
update public.ikea_rate_card set sl_no = 20 where product = 'Tag : Art Paper 300 GSM DS FSC Mix Credit; Size: 50x50 MM' and description = 'Tag : Art Paper 300 GSM DS FSC Mix Credit; Size: 50x50 MM';
update public.ikea_rate_card set sl_no = 21 where product = 'Tag : Art Paper 300 GSM DS FSC Mix Credit; Size: 75x75 MM' and description = 'Tag : Art Paper 300 GSM DS FSC Mix Credit; Size: 75x75 MM';
update public.ikea_rate_card set sl_no = 22 where product = 'Tag : Art Paper 300 GSM DS FSC Mix Credit; Size: 74x105 MM' and description = 'Tag : Art Paper 300 GSM DS FSC Mix Credit; Size: 74x105 MM';
update public.ikea_rate_card set sl_no = 23 where product = 'Tag : Art Paper 300 GSM DS FSC Mix Credit; Size: 80x40 MM' and description = 'Tag : Art Paper 300 GSM DS FSC Mix Credit; Size: 80x40 MM';
update public.ikea_rate_card set sl_no = 24 where product = 'Tag : Art Paper 300 GSM DS FSC Mix Credit; Size: 105x40 MM' and description = 'Tag : Art Paper 300 GSM DS FSC Mix Credit; Size: 105x40 MM';
update public.ikea_rate_card set sl_no = 25 where product = 'Tag : Art Paper 300 GSM DS FSC Mix Credit; Size: 74x210 MM' and description = 'Tag : Art Paper 300 GSM DS FSC Mix Credit; Size: 74x210 MM';
update public.ikea_rate_card set sl_no = 26 where product = 'Tag : Art Paper 300 GSM DS FSC Mix Credit; Size: 60x60 MM' and description = 'Tag : Art Paper 300 GSM DS FSC Mix Credit; Size: 60x60 MM';
update public.ikea_rate_card set sl_no = 27 where product = 'Tag : Art Paper 300 GSM DS FSC Mix Credit; Size: 85x85 MM' and description = 'Tag : Art Paper 300 GSM DS FSC Mix Credit; Size: 85x85 MM';
update public.ikea_rate_card set sl_no = 28 where product = 'Tag : Art Paper 300 GSM DS FSC Mix Credit; Size: 66x66 MM' and description = 'Tag : Art Paper 300 GSM DS FSC Mix Credit; Size: 66x66 MM';
update public.ikea_rate_card set sl_no = 29 where product = 'Tag : Art Paper 300 GSM DS FSC Mix Credit; Size: 100x100 MM' and description = 'Tag : Art Paper 300 GSM DS FSC Mix Credit; Size: 100x100 MM';
update public.ikea_rate_card set sl_no = 30 where product = 'Tag : Art Paper 300 GSM DS FSC Mix Credit; Size: A7' and description = 'Tag : Art Paper 300 GSM DS FSC Mix Credit; Size: A7';
update public.ikea_rate_card set sl_no = 31 where product = 'Reward Vouchers: Art Paper 300 GSM DS FSC Mix Credit; Size: 190x83 MM' and description = 'Reward Vouchers: Art Paper 300 GSM DS FSC Mix Credit; Size: 190x83 MM';
update public.ikea_rate_card set sl_no = 32 where product = 'Leaflet Art Paper 300 GSM FSC Mix Credit; Size: A4 (10000-20000)' and description = 'Leaflet Art Paper 300 GSM FSC Mix Credit; Size: A4 (10000-20000)';
update public.ikea_rate_card set sl_no = 33 where product = 'RETRO REFLECTIVE VINYL' and description = 'UV Print on Retro Reflective Vinyl';
update public.ikea_rate_card set sl_no = 34 where product = '3Ply Corrugated Board - FSC Mix Credit' and description = 'UV print on 4MM paper corrugated board';
update public.ikea_rate_card set sl_no = 35 where product = '5 Ply Corrugated Board - FSC Mix Credit' and description = 'UV print on 7MM paper corrugated board';
update public.ikea_rate_card set sl_no = 36 where product = '2MM Acrylic Sheet' and description = 'Supply of 2MM Acrylic Sheet, No print, Shape Cut';
update public.ikea_rate_card set sl_no = 37 where product = '3MM Acrylic Sheet' and description = 'Supply of 3MM Acrylic Sheet, No print, Shape Cut';
update public.ikea_rate_card set sl_no = 38 where product = '5MM Acrylic Sheet' and description = 'Supply of 5MM Acrylic Sheet, No print, Shape Cut';
update public.ikea_rate_card set sl_no = 39 where product = '15MM Alumimium FL Fabric Frame' and description = '15-25MM thin silver anodised Aluminium fabric frame';
update public.ikea_rate_card set sl_no = 40 where product = '50MM Aluminium BL Fabric Frame' and description = '50-70MM thin silver anodised Aluminium fabric backlit frame';
update public.ikea_rate_card set sl_no = 41 where product = '3M GREEN DOUBLE SIDE TAPE' and description = 'No Print, 3M Double Side foam tape supply';
update public.ikea_rate_card set sl_no = 42 where product = 'SD VINYL - AVERY 2903' and description = 'UV print on bubble free SAV - Avery 2903';
update public.ikea_rate_card set sl_no = 43 where product = 'SD VINYL - AVERY VALUE FILM GL' and description = 'UV print on Avery Value Film (SAV)';
update public.ikea_rate_card set sl_no = 44 where product = 'SD VINYL AVERY 2923 M' and description = 'UV Print on Avery 2923 M (bubble free Vinyl)';
update public.ikea_rate_card set sl_no = 45 where product = 'SD VINYL CLEAR 3M IJ8150' and description = 'UV Print on 3M IJ8150 (Clear Vinyl)';
update public.ikea_rate_card set sl_no = 46 where product = 'SD VINYL - 3M IJ35C 20M' and description = 'UV print bubble free SAV - 3M IJ35C';
update public.ikea_rate_card set sl_no = 47 where product = 'SD VINYL - AVERY 2923 (MATERIAL SUPPLY)' and description = 'No Print, Avery 2923 Material Supply';
update public.ikea_rate_card set sl_no = 48 where product = 'SD VINYL AVERY 2923 M with Protective Lamination' and description = 'UV Print on Avery 2923 M with Film lamination';
update public.ikea_rate_card set sl_no = 49 where product = 'SD VINYL 3M IJ 180C' and description = 'UV print on 3M IJ 180C, Controltac and Comply';
update public.ikea_rate_card set sl_no = 50 where product = 'SD VINYL 3M IJ4157' and description = 'UV print on 3M IJ4157 (Clear Vinyl) with die cut';
update public.ikea_rate_card set sl_no = 51 where product = '3M IJ48C PVC Free Vinyl' and description = 'UV Print on 3M IJ48C PVC Free Vinyl Controltac and Comply';

-- Diagnostics -- run after the block above.
-- Any row here means a product/description text didn't match exactly
-- (extra space, different punctuation, etc.) and still needs sl_no set
-- by hand -- check it against the master rate card sheet and fix directly.
select sl_no, scope, product, description
from public.ikea_rate_card
where sl_no is null
order by product;
