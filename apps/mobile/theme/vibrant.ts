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
 * font" for the denser screens (Sign Costing, its pricing summary, the
 * installation report). Not applied to Home/Copilot/Surveys/Sales by Rep,
 * which weren't called out as cluttered and read fine on the platform
 * default.
 */
export const fonts = {
  regular: "Roboto_400Regular",
  medium: "Roboto_500Medium",
  bold: "Roboto_700Bold",
  // "use Lora serif font with very small size" -- headings/titles only
  // (screen titles, section headers, tab names, the sign-in wordmark).
  // Never used for dense body/numeric/label text, which stays Roboto for
  // legibility at small sizes.
  serif: "Lora_400Regular",
  serifBold: "Lora_600SemiBold",
} as const;
