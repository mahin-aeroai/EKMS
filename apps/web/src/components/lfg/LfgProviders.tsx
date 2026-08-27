"use client";

import type { ReactNode } from "react";
import { LfgHostContext } from "@/lib/lfg-links";
import { LfgUserContext } from "@/lib/LfgUserContext";
import type { LfgIdentity } from "@/lib/lfg-auth";

/**
 * Renders both /lfg/* Context providers (LfgHostContext, LfgUserContext)
 * around `children`. Direct mirror of components/portal/PortalProviders.tsx
 * -- exists for the exact same reason: src/app/lfg/(app)/layout.tsx (the
 * thing that needs to provide these values) is a Server Component, and a
 * Server Component cannot render `SomeContext.Provider` itself -- see
 * PortalProviders.tsx's full comment for why (an RSC-bundler gotcha where
 * `.Provider` on a client-module export resolves to undefined in
 * production builds only, not caught by typecheck or `next dev`).
 */
export function LfgProviders({
  onLfgHost,
  identity,
  children,
}: {
  onLfgHost: boolean;
  identity: LfgIdentity | null;
  children: ReactNode;
}) {
  return (
    <LfgHostContext.Provider value={onLfgHost}>
      <LfgUserContext.Provider value={identity}>{children}</LfgUserContext.Provider>
    </LfgHostContext.Provider>
  );
}
