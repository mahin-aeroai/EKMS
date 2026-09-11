// The 5 named photo slots in the Customer Portal home page's hero banner
// collage (PortalHeroBanner.tsx) -- shared between that client component
// and the two /api/portal/hero-images/[slotKey]/* routes so the set of
// valid slot keys lives in exactly one place, not three.
export const PORTAL_HERO_SLOTS = [
  { key: "spaces", label: "Spaces" },
  { key: "vehicles", label: "Vehicles" },
  { key: "signage", label: "Signage" },
  { key: "displays", label: "Displays" },
  { key: "graphics", label: "Graphics" },
] as const;

export type PortalHeroSlotKey = (typeof PORTAL_HERO_SLOTS)[number]["key"];

export function isPortalHeroSlotKey(value: string): value is PortalHeroSlotKey {
  return PORTAL_HERO_SLOTS.some((s) => s.key === value);
}
