/**
 * "I am really excited abut this kind of UI for our app. can we redesign
 * this amazing UI" -- a new visual identity for the mobile app only,
 * inspired by the gradient-card dashboard-kit screenshots shared (bold
 * violet/pink gradients, big numbers, soft rounded cards, floating pill
 * buttons). Per the user's own call: a genuinely new gradient palette for
 * mobile, not just MMDI's existing blue restyled -- so this is deliberately
 * its own file, NOT an edit to packages/shared/src/theme.ts. That file is
 * shared with the web app (light/dark/enterprise), which keeps its blue
 * brand identity untouched; this file is apps/mobile-only.
 *
 * `Theme` (from @mmdi/shared/theme) has no gradient fields -- a flat
 * "primary" string can't express a two-stop gradient. VibrantTheme extends
 * it with gradientPrimary/gradientSecondary (consumed by <LinearGradient>
 * via GradientCard/GradientButton, see ./components.tsx) plus tabBarBg,
 * since the reference kit's bottom tab bar is dark even though the rest of
 * the UI is light -- a flat dark color, not a gradient, matching the
 * reference exactly.
 *
 * Deliberately ONE fixed theme, not a light/dark pair like the shared
 * Theme system -- the reference UI's whole identity is this specific light,
 * card-forward look; a "dark mode" version of a gradient-heavy design needs
 * real design decisions of its own (dark backgrounds usually mean muted,
 * not more vivid, gradients) rather than a mechanical inversion. Every
 * screen now reads `vibrant` directly instead of `themes[colorScheme]`,
 * so the mobile app no longer follows the system light/dark toggle --
 * flagged here as a deliberate scope trade-off, not an oversight; real
 * dark-mode support for this new look is a reasonable follow-up.
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
  surface: "#F8F7FC",
  surfaceRaised: "#FFFFFF",
  surfaceSunken: "#F1EEFA",
  surfaceOverlay: "#FFFFFF",
  line: "#E9E4F5",
  lineStrong: "#D8D0EC",
  ink: "#1A1523",
  inkSecondary: "#6B6478",
  inkMuted: "#9992A8",
  onBrand: "#FFFFFF",
  // "primary" stays a flat color (every existing StyleSheet color prop
  // expects a string, not a gradient) -- set to the gradient's brighter
  // stop so plain-color usages (borders, icons, small accents) still read
  // as part of the same family as the gradient surfaces.
  primary: "#8B5CF6",
  primaryHover: "#7C3AED",
  primaryTint: "#EDE7FC",
  success: "#0FAE7A",
  successTint: "#E3F9F1",
  warning: "#DC8A0E",
  warningTint: "#FCF1DC",
  danger: "#E0455B",
  dangerTint: "#FCE7EA",
  info: "#4C6EF5",
  infoTint: "#E9EEFE",
  ai: "#8B5CF6",
  aiTint: "#EDE7FC",

  gradientPrimary: ["#8B5CF6", "#EC4899"],
  gradientSecondary: ["#F472B6", "#FB923C"],
  onGradient: "#FFFFFF",
  tabBarBg: "#15101F",
  tabBarInactive: "#6B6478",
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
} as const;
