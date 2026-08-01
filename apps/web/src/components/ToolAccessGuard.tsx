"use client";

import { ShieldAlert } from "lucide-react";
import { useUserRole } from "@/lib/UserRoleContext";
import { useAllowedTools, canAccessTool } from "@/lib/UserToolsContext";

// Wraps a Tools-section workspace page's content. Restricted tools are
// already hidden from the sidebar/home page (AppShell.tsx / page.tsx), but
// someone can still land here via a bookmark, a shared link, or the browser
// back/forward stack -- this is the friendly message they see instead of
// the real tool, matching the "please ask an admin" pattern rather than a
// bare 404. See UserToolsContext.tsx for why this is UI-level only, not a
// real security boundary.
export function ToolAccessGuard({ toolId, toolLabel, children }: { toolId: string; toolLabel: string; children: React.ReactNode }) {
  const role = useUserRole();
  const allowedTools = useAllowedTools();

  if (!canAccessTool(role, allowedTools, toolId)) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line py-20 text-center">
        <ShieldAlert size={28} className="text-ink-muted" />
        <p className="text-sm font-medium text-ink">You don&apos;t have access to {toolLabel}</p>
        <p className="max-w-sm text-xs text-ink-muted">
          Ask an admin to grant you access from the Administration workspace&apos;s Tool access column.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
