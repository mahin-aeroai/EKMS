"use client";

import type { ReactNode } from "react";
import { PortalHostContext } from "@/lib/portal-links";
import { PortalUserContext } from "@/lib/PortalUserContext";
import type { PortalIdentity } from "@/lib/portal-auth";

/**
 * Renders both /portal/* Context providers (PortalHostContext,
 * PortalUserContext) around `children`. Exists ONLY because
 * src/app/portal/(app)/layout.tsx -- the thing that needs to provide these
 * values -- is a Server Component (it awaits headers()/getPortalIdentity()
 * directly), and a Server Component cannot render `SomeContext.Provider`
 * itself, even when SomeContext was created in a "use client" file and the
 * import type-checks fine.
 *
 * This is NOT the same as "Client Components can't be used in Server
 * Components" -- rendering a whole client component (like <PortalTopBar/>
 * below, or this one) from a Server Component is completely normal and
 * supported. The specific thing that breaks is reaching into an imported
 * client module's export and rendering a *property* of it (`.Provider`)
 * directly in server code: Next's production RSC bundler replaces every
 * export of a "use client" module with an opaque client reference when a
 * Server Component imports it, and `.Provider` on that reference resolves
 * to undefined -- not the real React Context. TypeScript doesn't catch
 * this (the reference is typed to match the original export), and
 * `next dev` doesn't reliably reproduce it either -- it only surfaced as a
 * real, consistent crash ("Element type is invalid ... but got: undefined")
 * once actually built and deployed, which is why this got past typecheck
 * and a clean local build before being caught live. See every OTHER
 * `.Provider` in this codebase (ThemeProvider.tsx, AppShell.tsx,
 * Notifications.tsx) for the working version of this: each one renders its
 * Provider from *inside* its own "use client" file, never from a Server
 * Component reaching in from outside -- exactly what this file now does
 * for the portal's two contexts.
 */
export function PortalProviders({
  onPortalHost,
  identity,
  children,
}: {
  onPortalHost: boolean;
  identity: PortalIdentity | null;
  children: ReactNode;
}) {
  return (
    <PortalHostContext.Provider value={onPortalHost}>
      <PortalUserContext.Provider value={identity}>{children}</PortalUserContext.Provider>
    </PortalHostContext.Provider>
  );
}
