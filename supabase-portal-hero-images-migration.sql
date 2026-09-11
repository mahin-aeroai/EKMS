-- MMDI ONE — Customer Portal: hero banner images (portal.mmdi.in home page)
--
-- WHAT THIS ADDS
-- Task feedback (Mahin, 11 Sept 2026, verbatim): "Maintain the same design
-- and recreate it, design looks flat, and give images upload tool so that
-- i can place them nicely." -- following an earlier round that coded the
-- Customer Portal home page's hero banner from a reference mockup
-- (PortalHeroBanner.tsx) but with a single placeholder image panel. This
-- migration adds the storage for that banner's 5 named photo slots
-- (spaces / vehicles / signage / displays / graphics — the same category
-- list shown on the banner itself) plus the RLS letting MMDI staff upload
-- one photo per slot and any signed-in portal viewer (staff or customer)
-- see the result. One row per slot, upserted by slot_key -- there is only
-- ever one "current" photo per slot, not a history.
--
-- Same staff-write/any-signed-in-viewer-read RLS shape as portal_products
-- (is_mmdi_staff() / is_portal_user() / user_role() helpers from
-- supabase-customer-portal-schema.sql STEP 13 — unchanged, just referenced
-- here) and the same R2 presigned-URL file pattern as portal_products'
-- own preview image (bytes never pass through the Next.js server).
--
-- ORDER TO RUN THIS IN
-- After supabase-customer-portal-schema.sql (needs is_mmdi_staff(),
-- is_portal_user(), and user_role() to already exist). Safe to re-run.

-- ============================================================
-- STEP 1 — Table
-- ============================================================

create table if not exists public.portal_hero_images (
  id uuid primary key default gen_random_uuid(),
  -- One of the 5 fixed slot keys the banner's collage renders --
  -- "spaces" | "vehicles" | "signage" | "displays" | "graphics" (see
  -- HERO_SLOTS in PortalHeroBanner.tsx) -- not an open-ended value, but
  -- left as plain text rather than a check constraint so a 6th slot can
  -- be added on the UI side alone, without a migration.
  slot_key text not null unique,
  relative_path text not null,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- STEP 2 — RLS
-- ============================================================

alter table public.portal_hero_images enable row level security;

drop policy if exists portal_hero_images_select on public.portal_hero_images;
drop policy if exists portal_hero_images_write_staff on public.portal_hero_images;
drop policy if exists portal_hero_images_update_staff on public.portal_hero_images;
drop policy if exists portal_hero_images_delete_admin on public.portal_hero_images;

-- Any signed-in staff member or portal customer may see the banner photos
-- -- there's nothing company-scoped or sensitive here, same reasoning as
-- portal_products' own catalog-wide select.
create policy portal_hero_images_select on public.portal_hero_images
  for select to authenticated
  using (public.is_mmdi_staff() or public.is_portal_user());

create policy portal_hero_images_write_staff on public.portal_hero_images
  for insert to authenticated
  with check (public.user_role() in ('admin', 'editor'));

create policy portal_hero_images_update_staff on public.portal_hero_images
  for update to authenticated
  using (public.user_role() in ('admin', 'editor'))
  with check (public.user_role() in ('admin', 'editor'));

create policy portal_hero_images_delete_admin on public.portal_hero_images
  for delete to authenticated
  using (public.user_role() = 'admin');

-- ============================================================
-- Verification — run after applying
-- ============================================================
-- As staff (admin/editor): upload a photo for each slot from Customer
-- Portal → Hero Banner (new tab). As a portal customer: confirm the
-- banner on portal.mmdi.in's home page shows those photos, and that
-- attempting to write portal_hero_images directly (e.g. via the API
-- routes) as a customer session 403s.
