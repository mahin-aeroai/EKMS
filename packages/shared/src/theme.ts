/**
 * Design tokens lifted verbatim from src/app/globals.css.
 *
 * These are the same values the web app resolves at runtime, restated as a JS
 * object so React Native can consume them (RN has no CSS custom properties).
 * Names match the CSS variables exactly -- `ink`, `surfaceRaised`, `lineStrong`
 * -- so a component reads the same on both platforms and a token rename is a
 * find-and-replace rather than a translation exercise.
 *
 * If globals.css changes, change this. There is no build step keeping them in
 * sync, which is a real risk; a codegen script reading globals.css would be
 * better once the app is past v1.
 */

export const neutrals = {
  n0: "#ffffff",
  n50: "#f8f9fb",
  n100: "#f1f3f6",
  n200: "#e4e8ee",
  n300: "#cfd6e0",
  n400: "#a9b3c1",
  n500: "#7c8797",
  n600: "#5b6472",
  n700: "#3f4753",
  n800: "#262c35",
  n900: "#141821",
} as const;

export const brand = {
  navy: "#1f3864",
  steel: "#2e5395",
  steelLight: "#dce6f1",
} as const;

export interface Theme {
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  surfaceOverlay: string;
  line: string;
  lineStrong: string;
  ink: string;
  inkSecondary: string;
  inkMuted: string;
  onBrand: string;
  primary: string;
  primaryHover: string;
  primaryTint: string;
  success: string;
  successTint: string;
  warning: string;
  warningTint: string;
  danger: string;
  dangerTint: string;
  info: string;
  infoTint: string;
  ai: string;
  aiTint: string;
}

export const light: Theme = {
  surface: neutrals.n0,
  surfaceRaised: neutrals.n0,
  surfaceSunken: neutrals.n50,
  surfaceOverlay: neutrals.n0,
  line: neutrals.n200,
  lineStrong: neutrals.n300,
  ink: neutrals.n900,
  inkSecondary: neutrals.n600,
  inkMuted: neutrals.n500,
  onBrand: "#ffffff",
  primary: brand.steel,
  primaryHover: brand.navy,
  primaryTint: brand.steelLight,
  success: "#1a7f45",
  successTint: "#e3f5e9",
  warning: "#92660a",
  warningTint: "#fbf0d9",
  danger: "#b3261e",
  dangerTint: "#fbe6e4",
  info: "#1a5fb4",
  infoTint: "#e3edfb",
  ai: "#6941c6",
  aiTint: "#f2ecfc",
};

export const dark: Theme = {
  surface: neutrals.n900,
  surfaceRaised: "#1b2029",
  surfaceSunken: "#0f1218",
  surfaceOverlay: "#1b2029",
  line: neutrals.n800,
  lineStrong: neutrals.n700,
  ink: neutrals.n100,
  inkSecondary: neutrals.n400,
  inkMuted: neutrals.n500,
  onBrand: "#ffffff",
  primary: "#6f97d6",
  primaryHover: "#90b1e3",
  primaryTint: "rgba(111, 151, 214, 0.16)",
  success: "#4ec97f",
  successTint: "rgba(78, 201, 127, 0.14)",
  warning: "#e0ab3d",
  warningTint: "rgba(224, 171, 61, 0.14)",
  danger: "#ea6b63",
  dangerTint: "rgba(234, 107, 99, 0.14)",
  info: "#6ea6f2",
  infoTint: "rgba(110, 166, 242, 0.14)",
  ai: "#b09aef",
  aiTint: "rgba(176, 154, 239, 0.16)",
};

export const enterprise: Theme = {
  surface: "#05070b",
  surfaceRaised: "#0d1117",
  surfaceSunken: "#000000",
  surfaceOverlay: "#0d1117",
  line: "#2a323d",
  lineStrong: "#3d4753",
  ink: "#ffffff",
  inkSecondary: "#c7cfda",
  inkMuted: "#8b96a5",
  onBrand: "#ffffff",
  primary: "#6f97d6",
  primaryHover: "#90b1e3",
  primaryTint: "rgba(111, 151, 214, 0.2)",
  success: "#35d97a",
  successTint: "rgba(53, 217, 122, 0.18)",
  warning: "#ffc247",
  warningTint: "rgba(255, 194, 71, 0.18)",
  danger: "#ff5c52",
  dangerTint: "rgba(255, 92, 82, 0.18)",
  info: "#5aa7ff",
  infoTint: "rgba(90, 167, 255, 0.18)",
  ai: "#c3aaff",
  aiTint: "rgba(195, 170, 255, 0.18)",
};

export const themes = { light, dark, enterprise } as const;
export type ThemeName = keyof typeof themes;

/** Radii and durations, also from globals.css. */
export const radius = { sm: 4, md: 8, lg: 12, full: 9999 } as const;
export const duration = { micro: 120, standard: 220, page: 340 } as const;

/**
 * Shadows are deliberately omitted. The CSS values are box-shadow strings that
 * RN cannot parse, and iOS shadows are a different model entirely
 * (shadowColor/Offset/Opacity/Radius, plus elevation on Android). Define them
 * per-platform in the app rather than pretending they port.
 */
