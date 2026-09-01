import { Roboto_Condensed } from "next/font/google";

// Scoped to just this tool's route subtree (dashboard, editor, defaults --
// every page under workspaces/site-survey-report) per feedback wanting a
// "condensed" typeface with slightly larger text, WITHOUT changing the
// rest of MMDI ONE's global Roboto (see the root layout.tsx's own comment
// on --font-roboto/--font-sans). A nested layout + next/font is the
// standard Next.js way to scope a self-hosted font to one route tree --
// no other workspace in this app has needed this before, so there's no
// existing precedent to match beyond the root layout's own font-loading
// pattern. Same family (Roboto) so this reads as "the app's font, just
// the condensed cut" rather than an unrelated typeface. Weights match the
// root layout's Roboto config (400/500/700) for the same font-medium/
// font-semibold/font-bold coverage this tool's own components rely on.
const robotoCondensed = Roboto_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto-condensed",
  display: "swap",
});

export default function SiteSurveyReportLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${robotoCondensed.variable} font-[family-name:var(--font-roboto-condensed)]`}>{children}</div>
  );
}
