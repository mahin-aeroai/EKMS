import type { Metadata, Viewport } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";

// Roboto was already named as a fallback in globals.css's --font-sans stack,
// but never actually loaded -- it only rendered on OSes that happen to ship
// it as a system font (Android/ChromeOS), so most users saw Segoe UI/San
// Francisco instead. next/font self-hosts it (no external request, no
// layout-shift flash) and exposes it as --font-roboto, which --font-sans
// now references first. Free/OFL-licensed, so no licensing concern (unlike
// Cambria for the estimate PDF elsewhere in this app). Weights: 400/500/700
// cover font-normal/font-medium/font-bold; Roboto has no 600 cut at all
// (Google never released one), so font-semibold falls back to the nearest
// weight the browser can match -- a minor, purely cosmetic tradeoff.
const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
  display: "swap",
});
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ToastProvider } from "@/components/ui/Notifications";
import { AppShell } from "@/components/AppShell";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { InstallPrompt } from "@/components/InstallPrompt";
import { IosInstallHint } from "@/components/IosInstallHint";
import { getOnPortalHost } from "@/lib/portal-host-server";
import { getOnLfgHost } from "@/lib/lfg-host-server";

// A function (not a static object) so it can omit the PWA-install fields
// below on portal.mmdi.in / lfgconnect.mmdi.in — see the
// "onPortalHost || onLfgHost" branch in RootLayout for why: this
// manifest/appleWebApp block is what makes Chrome/iOS treat the site as
// "installable" as MMDI ONE (the internal staff app) in the first place,
// including the address-bar install icon that our own
// InstallPrompt/IosInstallHint components don't control. Just hiding those
// two components would leave the browser's own native install affordance
// still pointing customers/partners at installing something branded
// "MMDI ONE".
export async function generateMetadata(): Promise<Metadata> {
  const onPortalHost = await getOnPortalHost();
  const onLfgHost = await getOnLfgHost();

  return {
    title: "MMDI ONE — Product Design System",
    description:
      "The enterprise design language for MMDI ONE: design tokens, component library, layout system, navigation system, workspace pattern, AI interaction model and responsive system.",
    ...(onPortalHost || onLfgHost
      ? {}
      : {
          manifest: "/manifest.webmanifest",
          // iOS has no manifest-driven install flow -- these are the meta
          // tags that actually control "Add to Home Screen" standalone
          // display there (Android reads the manifest above instead, via
          // Chrome's own install UI).
          appleWebApp: {
            capable: true,
            statusBarStyle: "default",
            title: "MMDI ONE",
          },
          icons: {
            apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
          },
          // Next's `appleWebApp.capable` only emits the newer unprefixed
          // "mobile-web-app-capable" tag -- iOS Safari's own docs
          // (Configuring Web Applications) specifically name the apple-
          // prefixed tag as what enables standalone mode there, so it's
          // added explicitly rather than assumed.
          other: {
            "apple-mobile-web-app-capable": "yes",
          },
        }),
  };
}

export const viewport: Viewport = {
  themeColor: "#1f3864",
  // Lets the app draw under the iOS status bar/notch/home-indicator area in
  // standalone mode instead of leaving a hard black bar there -- paired with
  // the safe-area padding on TopNav (see that component).
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Whether this request came in on portal.mmdi.in / lfgconnect.mmdi.in --
  // passed down so AppShell can skip its own sidebar/topnav chrome there.
  // AppShell can't tell this on its own: it's a Client Component, and both
  // the customer portal and the LFG Connect partner portal's whole point
  // is that their pages render at clean, unprefixed paths on their own
  // host (portal.mmdi.in/, not portal.mmdi.in/portal; lfgconnect.mmdi.in/,
  // not lfgconnect.mmdi.in/lfg) via a middleware rewrite that's
  // deliberately invisible to the browser -- usePathname() there returns
  // "/", identical to the main app's own static home page, so pathname
  // alone can't distinguish them. Reading the request host here
  // (next/headers) is the only reliable way, and since this is the ONE
  // layout every route in the app shares, doing it here does mean every
  // route now renders dynamically instead of some of them being
  // statically prerendered -- a deliberate, small trade-off: correctness
  // (no customer- or partner-facing page can ever render wrapped in the
  // internal staff sidebar) outweighs the prerendering win for an
  // internal tool at this traffic scale.
  //
  // Bug fixed here (1 Sept 2026): only onPortalHost was ever computed and
  // passed down -- there was no onLfgHost equivalent at all, so every LFG
  // Connect partner login saw the full internal 36-workspace sidebar
  // wrapped around their own compact LFG layout. See AppShell.tsx's
  // onLfgHost doc comment for the full story.
  const onPortalHost = await getOnPortalHost();
  const onLfgHost = await getOnLfgHost();
  const hideInternalBranding = onPortalHost || onLfgHost;

  return (
    <html lang="en" className={`h-full antialiased ${roboto.variable}`}>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <ToastProvider>
            <AppShell onPortalHost={onPortalHost} onLfgHost={onLfgHost}>
              {children}
            </AppShell>
            {/*
              The install-app prompts (and the service worker that backs
              them) are for MMDI ONE, the internal staff app -- but this is
              the one layout every route shares, portal.mmdi.in and
              lfgconnect.mmdi.in included. Un-gated, a customer or partner
              would get an "Install MMDI ONE" banner for a tool they don't
              use and have never heard of. Skipped entirely on those hosts
              rather than re-branded for them -- see generateMetadata()
              above for the matching manifest/appleWebApp gating (needed
              separately: the browser's own native install icon doesn't go
              through either of these components). ServiceWorkerRegister
              itself still renders there -- in unregister-only mode, to
              clean up any service worker a customer/partner already
              picked up before this gating existed, rather than just
              stopping new registrations and leaving old ones stuck.
            */}
            <ServiceWorkerRegister unregisterOnly={hideInternalBranding} />
            {!hideInternalBranding && (
              <>
                <InstallPrompt />
                <IosInstallHint />
              </>
            )}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
