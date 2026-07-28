import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ToastProvider } from "@/components/ui/Notifications";
import { AppShell } from "@/components/AppShell";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { InstallPrompt } from "@/components/InstallPrompt";

export const metadata: Metadata = {
  title: "MMDI ONE — Product Design System",
  description:
    "The enterprise design language for MMDI ONE: design tokens, component library, layout system, navigation system, workspace pattern, AI interaction model and responsive system.",
  manifest: "/manifest.webmanifest",
  // iOS has no manifest-driven install flow -- these are the meta tags that
  // actually control "Add to Home Screen" standalone display there (Android
  // reads the manifest above instead, via Chrome's own install UI).
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MMDI ONE",
  },
  icons: {
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  // Next's `appleWebApp.capable` only emits the newer unprefixed
  // "mobile-web-app-capable" tag -- iOS Safari's own docs (Configuring Web
  // Applications) specifically name the apple-prefixed tag as what enables
  // standalone mode there, so it's added explicitly rather than assumed.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#1f3864",
  // Lets the app draw under the iOS status bar/notch/home-indicator area in
  // standalone mode instead of leaving a hard black bar there -- paired with
  // the safe-area padding on TopNav (see that component).
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
            <ServiceWorkerRegister />
            <InstallPrompt />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
