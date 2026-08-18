/**
 * "Actually switch to this pink/navy palette" -- a real rebrand away from
 * the red theme (#E0293D, see git history), sourced from a brand-board
 * reference the user shared (blush pink / cream / taupe / dusty blue /
 * navy, "very neat and clean look"). That board only gives six swatches
 * for a full marketing brand, not a UI system -- surface/text/tint/hover/
 * gradient/tab-bar all had to be derived from those six rather than
 * lifted directly:
 *   #FFF9F9 (softest blush)  -> surface
 *   #F0E7E1 (cream)          -> surfaceSunken
 *   #EED8D1 (blush pink)     -> primaryTint / aiTint
 *   #CEC5C1 (taupe)          -> lineStrong
 *   #8C98B0 (dusty blue)     -> inkMuted, gradientPrimary's light stop
 *   #1F2947 (navy)           -> primary / ink / ai, gradientPrimary's dark stop
 * primaryHover, inkSecondary, line, tabBarBg and tabBarInactive are HSL
 * lightness variants of navy/dusty-blue (same approach as the old red
 * palette's derivation) so they read as part of one family rather than
 * invented colors.
 *
 * success/warning/danger/info are deliberately UNCHANGED -- they're
 * semantic status colors (not brand colors), weren't part of the
 * reference board, and changing them wasn't asked for.
 *
 * The app icon/logo-mark image itself is still the original uploaded red
 * "M" artwork -- that's a raster asset, not a themeable value, and
 * swapping it wasn't part of this round. Flagging in case the mismatch
 * (red icon, navy in-app theme) stands out once this is on-device.
 *
 * `Theme` (from @mmdi/shared/theme) has no gradient fields -- a flat
 * "primary" string can't express a two-stop gradient. VibrantTheme extends
 * it with gradientPrimary/gradientSecondary (consumed by <LinearGradient>
 * via GradientCard/GradientButton, see ./components.tsx) plus tabBarBg, a
 * dark tab bar even though the rest of the UI is light -- unchanged
 * structurally from every earlier round, just retinted toward navy.
 *
 * Deliberately ONE fixed theme, not a light/dark pair like the shared
 * Theme system -- see the original round's reasoning, unchanged by this
 * recolor. Every screen reads `vibrant` directly instead of
 * `themes[colorScheme]`, so the mobile app still doesn't follow the
 * system light/dark toggle.
 */

import type { Theme } from "@mmdi/shared/theme";

export interface VibrantTheme extends Theme {
  gradientPrimary: [string, string];
  gradientSecondary: [string, string];
  onGradient: string;
  tabBarBg: string;
  tabBarInactive: string;
}

export const vibrant: VibrantTheme = {
  surface: "#FFF9F9",
  surfaceRaised: "#FFFFFF",
  surfaceSunken: "#F0E7E1",
  surfaceOverlay: "#FFFFFF",
  line: "#EBE8E6",
  lineStrong: "#CEC5C1",
  ink: "#1F2947",
  inkSecondary: "#415181",
  inkMuted: "#8C98B0",
  onBrand: "#FFFFFF",
  primary: "#1F2947",
  primaryHover: "#161D32",
  primaryTint: "#EED8D1",
  success: "#0FAE7A",
  successTint: "#E3F9F1",
  warning: "#DC8A0E",
  warningTint: "#FCF1DC",
  danger: "#7A1220",
  dangerTint: "#F5DEDF",
  info: "#4C6EF5",
  infoTint: "#E9EEFE",
  ai: "#1F2947",
  aiTint: "#EED8D1",

  // Dusty blue to navy -- "a gradient from lighter to dark", same
  // light-to-dark-same-family structure as the old red gradient.
  gradientPrimary: ["#8C98B0", "#1F2947"],
  // Used sparingly (GradientButton/GradientCard variant="secondary") --
  // a monochrome navy variant rather than trying to stretch the palette's
  // lightest swatch (blush pink) across a full gradient, which would put
  // onGradient's white text on a too-light background at that end.
  gradientSecondary: ["#2F3D6B", "#1F2947"],
  onGradient: "#FFFFFF",
  tabBarBg: "#101424",
  tabBarInactive: "#838CA0",
};

/**
 * Roboto family names, loaded via @expo-google-fonts/roboto in
 * app/_layout.tsx -- "make th eofnts smaller roboto or suitable small
 * font", now used for every fontFamily in the app, headings included.
 *
 * "still the fonts erantic" + reference screenshots (CRED, a shopping
 * app's product-detail sheet) -- those apps read as clean and consistent
 * because they use ONE small sans throughout, not because they use a
 * fancier font. This file previously also exported serif/serifBold
 * (Lora, "use Lora serif font with very small size") applied to nav
 * titles, card titles, and section labels all at once -- which is what
 * was reading as inconsistent next to the references, not any one size
 * or weight in isolation. Serif is gone now (see _layout.tsx -- Lora is
 * no longer loaded at all); every screen that used serif/serifBold now
 * uses `bold` for titles/emphasis and the SECTION_LABEL pattern below for
 * section headers, matching the references' small uppercase-tracked
 * "FOR YOU" / "YOUR REWARDS & BENEFITS" style labels.
 */
export const fonts = {
  regular: "Roboto_400Regular",
  medium: "Roboto_500Medium",
  bold: "Roboto_700Bold",
} as const;

/**
 * The small uppercase-tracked muted label style used above every section
 * in the CRED reference screenshots ("FOR YOU", "YOUR REWARDS &
 * BENEFITS") -- report/[id].tsx's sectionTitle already matched this by
 * chance; every other screen's section title now uses this same shape
 * instead of each screen inventing its own heading style.
 */
export function sectionLabelStyle(t: VibrantTheme) {
  return {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: t.inkMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  };
}

/**
 * "drop down selction font should be smaller and more decorative with each
 * line with slighly colored" -- a small cycling accent palette so every
 * picker/dropdown list (sheet material, unit, sales rep, photo-source, ...)
 * reads as a row of gently colored lines instead of flat black-on-white,
 * without inventing new brand colors. Reuses existing semantic theme colors
 * (primary/info/success/warning) rather than arbitrary hues so it still
 * sits "within red theme" -- also doubles as the "add few more color inside
 * the pages" pass across those same option lists.
 */
export function optionAccent(t: VibrantTheme, index: number): string {
  const accents = [t.primary, t.info, t.success, t.warning];
  return accents[index % accents.length];
}
