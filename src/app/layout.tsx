import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ToastProvider } from "@/components/ui/Notifications";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "MMDI ONE — Product Design System",
  description:
    "The enterprise design language for MMDI ONE: design tokens, component library, layout system, navigation system, workspace pattern, AI interaction model and responsive system.",
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
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
