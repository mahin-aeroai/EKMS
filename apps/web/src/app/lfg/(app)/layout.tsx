import type { ReactNode } from "react";
import { headers } from "next/headers";
import { getLfgIdentity } from "@/lib/lfg-auth";
import { LFG_HOST } from "@/lib/lfg-host";
import { LfgTopBar } from "@/components/lfg/LfgTopBar";
import { LfgProviders } from "@/components/lfg/LfgProviders";

// Deliberately its own layout, not a child of AppShell -- direct mirror of
// src/app/portal/(app)/layout.tsx. The LFG partner portal is a separate,
// compact surface for external installation-partner accounts (see
// supabase-lfg-site-management-schema.sql's header comment), same
// reasoning as the customer portal: no 36-workspace sidebar, no command
// palette, no AI drawer.
export const dynamic = "force-dynamic";

export default async function LfgLayout({ children }: { children: ReactNode }) {
  const identity = await getLfgIdentity();
  // Whether this request came in on lfgconnect.mmdi.in vs. a /lfg-prefixed
  // path on another host -- see lfg-links.ts for why this can't just be
  // inferred client-side.
  const hostHeader = (await headers()).get("host") ?? "";
  const onLfgHost = hostHeader === LFG_HOST;

  return (
    <div data-theme="lfg" className="min-h-screen bg-surface-sunken">
      <LfgProviders onLfgHost={onLfgHost} identity={identity}>
        {identity && <LfgTopBar partnerName={identity.partnerName} fullName={identity.fullName} email={identity.email} />}
        <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
          {identity ? (
            children
          ) : (
            <div className="mx-auto mt-16 max-w-md rounded-lg border border-line bg-surface p-6 text-center shadow-1">
              <h1 className="text-base font-semibold text-ink">No LFG partner account here</h1>
              <p className="mt-2 text-sm text-ink-secondary">
                This sign-in isn&apos;t linked to an LFG partner account. If you&apos;re MMDI staff, use the main
                app -- or ask an admin to turn on &quot;Allow LFG Connect login&quot; for your account in
                Administration if you need to sign in here directly. If you&apos;re a partner expecting access,
                contact MMDI to confirm your account.
              </p>
            </div>
          )}
        </main>
      </LfgProviders>
    </div>
  );
}
