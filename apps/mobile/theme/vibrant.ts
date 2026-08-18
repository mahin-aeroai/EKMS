/**
 * "no i dont want blue ..MMDI is build on red theme i cant present with
 * blue. use Hex#e0293d like attached with a gradient from lighter to
 * dark." -- supersedes this file's original violet/pink palette (from the
 * "I am really excited abut this kind of UI" round). Per the user's own
 * call: the RED replaces violet as the whole app's gradient theme (every
 * screen this file's `vibrant` export touches), not just the logo -- still
 * deliberately its own file, not an edit to packages/shared/src/theme.ts,
 * which stays blue for the web app.
 *
 * Palette derived from the user's exact hex (#E0293D) by varying HSL
 * lightness only, keeping the same hue/saturation across every stop, so
 * "primary" (flat accent), the gradient's light/dark ends, and the tint
 * all read as one consistent red rather than unrelated reds:
 *   H 353°, S 75%  ->  lighter #EA707E, base #E0293D, hover #C41C2F,
 *   darker #A91828, tint #FBE4E7.
 *
 * `Theme` (from @mmdi/shared/theme) has no gradient fields -- a flat
 * "primary" string can't express a two-stop gradient. VibrantTheme extends
 * it with gradientPrimary/gradientSecondary (consumed by <LinearGradient>
 * via GradientCard/GradientButton, see ./components.tsx) plus tabBarBg, a
 * dark tab bar even though the rest of the UI is light -- unchanged from
 * the original violet round, just retinted toward the red family instead
 * of pure black so it still feels part of the same palette.
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
  surface: "#FCF7F7",
  surfaceRaised: "#FFFFFF",
  surfaceSunken: "#FBEEEF",
  surfaceOverlay: "#FFFFFF",
  line: "#F3DEE0",
  lineStrong: "#E7C7CA",
  ink: "#221417",
  inkSecondary: "#75585C",
  inkMuted: "#A68689",
  onBrand: "#FFFFFF",
  // "primary" stays a flat color (every existing StyleSheet color prop
  // expects a string, not a gradient) -- set to the user's exact hex so
  // plain-color usages (borders, icons, small accents) match it precisely.
  primary: "#E0293D",
  primaryHover: "#C41C2F",
  primaryTint: "#FBE4E7",
  success: "#0FAE7A",
  successTint: "#E3F9F1",
  warning: "#DC8A0E",
  warningTint: "#FCF1DC",
  // Deliberately NOT the same red as `primary` -- with the brand itself
  // now crimson, reusing it for danger would make error text/discard
  // buttons indistinguishable from ordinary branded UI. A darker, more
  // muted maroon keeps the "something's wrong" read without competing
  // with the brand accent.
  danger: "#7A1220",
  dangerTint: "#F5DEDF",
  info: "#4C6EF5",
  infoTint: "#E9EEFE",
  ai: "#E0293D",
  aiTint: "#FBE4E7",

  // Light to dark, same hue -- "a gradient from lighter to dark".
  gradientPrimary: ["#EA707E", "#A91828"],
  // Used sparingly (GradientButton/GradientCard variant="secondary") --
  // a warm coral-to-red companion so it still reads as the same brand
  // when it does show up, not a second unrelated color.
  gradientSecondary: ["#FF8A65", "#E0293D"],
  onGradient: "#FFFFFF",
  tabBarBg: "#1C1214",
  tabBarInactive: "#8A6E71",
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
