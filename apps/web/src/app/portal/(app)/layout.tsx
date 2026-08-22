import type { ReactNode } from "react";
import { getPortalIdentity } from "@/lib/portal-auth";
import { PortalUserContext } from "@/lib/PortalUserContext";
import { PortalTopBar } from "@/components/portal/PortalTopBar";

// Deliberately its own layout, not a child of AppShell — the customer
// portal is a separate, compact surface for external retail-chain
// accounts (see supabase-customer-portal-schema.sql's header comment).
// No 36-workspace sidebar, no command palette, no AI drawer: five simple
// destinations (Products, Orders, Account, Security) behind one top bar.
export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const identity = await getPortalIdentity();

  return (
    <div className="min-h-screen bg-surface-sunken">
      {identity && <PortalTopBar companyName={identity.companyName} fullName={identity.fullName} email={identity.email} />}
      <PortalUserContext.Provider value={identity}>
        <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
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
      </PortalUserContext.Provider>
    </div>
  );
}
