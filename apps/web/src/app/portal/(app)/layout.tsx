import type { ReactNode } from "react";
import { headers } from "next/headers";
import { getPortalIdentity } from "@/lib/portal-auth";
import { PORTAL_HOST } from "@/lib/portal-host";
import { PortalTopBar } from "@/components/portal/PortalTopBar";
import { PortalProviders } from "@/components/portal/PortalProviders";

// Deliberately its own layout, not a child of AppShell — the customer
// portal is a separate, compact surface for external retail-chain
// accounts (see supabase-customer-portal-schema.sql's header comment).
// No 36-workspace sidebar, no command palette, no AI drawer: five simple
// destinations (Products, Orders, Account, Security) behind one top bar.
export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const identity = await getPortalIdentity();
  // data-theme="portal-vibrant" below opts every portal page into the
  // mobile-app color/radius preview (see globals.css) without touching the
  // internal staff app's own light/dark/enterprise ThemeProvider, which
  // still governs <html> separately -- CSS custom properties redeclared on
  // this nested element win for everything inside it regardless of what
  // <html> is set to.
  // Whether this request came in on portal.mmdi.in vs. a /portal-prefixed
  // path on another host -- decides whether internal links below render
  // clean (subdomain) or /portal-prefixed (everywhere else). See
  // portal-links.ts for why this can't just be inferred client-side.
  const hostHeader = (await headers()).get("host") ?? "";
  const onPortalHost = hostHeader === PORTAL_HOST;

  return (
    <div data-theme="portal-vibrant" className="min-h-screen bg-surface-sunken">
      <PortalProviders onPortalHost={onPortalHost} identity={identity}>
        {identity && <PortalTopBar companyName={identity.companyName} fullName={identity.fullName} email={identity.email} />}
        <main className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
          {identity ? (
            children
          ) : (
            <div className="mx-auto mt-16 max-w-md rounded-lg border border-line bg-surface p-6 text-center shadow-1">
              <h1 className="text-base font-semibold text-ink">No customer-portal account here</h1>
              <p className="mt-2 text-sm text-ink-secondary">
                This sign-in isn&apos;t linked to a customer-portal account. If you&apos;re MMDI staff, use the main
                app; if you&apos;re a customer expecting access, contact MMDI to confirm your account.
              </p>
            </div>
          )}
        </main>
      </PortalProviders>
    </div>
  );
}
