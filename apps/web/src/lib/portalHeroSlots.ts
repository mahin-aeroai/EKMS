// The Customer Portal home page's hero banner (PortalHeroBanner.tsx) image
// slot(s) -- shared between that client component, the staff upload tab
// (HeroBannerTab.tsx), and the two /api/portal/hero-images/[slotKey]/*
// routes so the set of valid slot keys lives in exactly one place, not
// three.
//
// 11 Sept 2026: task feedback -- "make one image insert i will post the
// collage" -- collapsed from 5 named photo slots (spaces/vehicles/
// signage/displays/graphics, each auto-clipped into a diagonal strip) down
// to a single pre-made collage image staff uploads as one file. Kept as a
// keyed array (not a bare constant) rather than ripping out the slot
// concept entirely -- the upload API routes are already slot-keyed, so
// this is the smallest change that gets there, and a slot could be added
// back later without touching the routes again.
export const PORTAL_HERO_SLOTS = [{ key: "collage", label: "Hero Collage" }] as const;

export type PortalHeroSlotKey = (typeof PORTAL_HERO_SLOTS)[number]["key"];

export function isPortalHeroSlotKey(value: string): value is PortalHeroSlotKey {
  return PORTAL_HERO_SLOTS.some((s) => s.key === value);
}
