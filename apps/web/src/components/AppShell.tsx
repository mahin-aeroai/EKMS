"use client";

import { useRouter, usePathname } from "next/navigation";
import {
  Users,
  Bell,
  FileStack,
  Home,
  Building2,
  Wrench,
  Package,
  FolderKanban,
  LayoutDashboard,
  Bot,
  BarChart3,
  FileText,
  FileSignature,
  Factory,
  ClipboardList,
  Truck,
  Boxes,
  ShoppingCart,
  Handshake,
  Calculator,
  PenTool,
  ListChecks,
  Lightbulb,
  Share2,
  UserRound,
  Landmark,
  ShieldCheck,
  Settings,
  Receipt,
  Target,
  Ruler,
  Scissors,
  Camera,
  QrCode,
  FileSpreadsheet,
  Layers,
  PackageCheck,
} from "lucide-react";
import { Sidebar, type SidebarSection } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { CommandPalette, type Command } from "@/components/ui/CommandPalette";
import { useToast } from "@/components/ui/Notifications";
import { useEffect, useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { AIConversation, type ChatTurn } from "@/components/ui/AIConversation";
import { ContactPicker, type PickedContact } from "@/components/ui/ContactPicker";
import { supabase } from "@/lib/supabase";
import type { UserRole } from "@mmdi/shared/rows";
import { UserRoleContext } from "@/lib/UserRoleContext";
import { UserGroupsContext, canAccessGroup } from "@/lib/UserGroupsContext";
import { UserToolsContext, canAccessTool } from "@/lib/UserToolsContext";

// Maps a NAV section's title to the group id used in profiles.allowed_groups
// (supabase-module-access-migration.sql). Sections not listed here (Home,
// Executive, Tools) are never restricted -- see that migration's header
// comment for why Executive specifically stays ungated; Tools follows the
// same reasoning (a grab-bag of standalone browser utilities that don't map
// to one business-data group, same as Executive already didn't).
//
// The old Design System Home / Foundations / Components sections (the
// component-library showcase, not a business feature -- see PROJECT_STATUS.md
// "What MMDI ONE is") were removed from this nav entirely per Srinivas's
// request. Their page files are untouched, just unlinked -- reachable at
// /design-system, /foundations, /components/* if ever needed again.
//
// People/Finance/Compliance/Administration used to be 4 separate
// single-item sections, each independently gated. They're now one visual
// "Admin" section, so they share one gating key ("administration", the
// most privileged of the four) -- there's no per-item gating within a
// section in this filter, only per-section. In practice this is a no-op
// today: nobody has allowed_groups configured yet (fail-open / everyone
// unrestricted), so flag this if that changes before someone relies on
// People/Finance/Compliance being independently restrictable again.
const SECTION_GROUP: Record<string, string> = {
  Customers: "customers",
  Operations: "operations",
  Manufacturing: "manufacturing",
  Knowledge: "knowledge",
  Admin: "administration",
};

// Exported so the icon-grid home page (src/app/page.tsx) can render every
// workspace as a tile from this exact same data -- one source of truth for
// "what workspaces exist and which group they're in," instead of a second
// hardcoded list that could drift out of sync with the sidebar.
export const NAV: SidebarSection[] = [
  {
    title: "Home",
    items: [{ id: "home", label: "Home", icon: <Home size={16} />, href: "/" }],
  },
  {
    title: "Executive",
    items: [
      { id: "command-center", label: "Command Center", icon: <LayoutDashboard size={16} />, href: "/workspaces/command-center" },
      { id: "ai-copilot", label: "AI Copilot", icon: <Bot size={16} />, href: "/workspaces/ai-copilot" },
      { id: "analytics", label: "Analytics", icon: <BarChart3 size={16} />, href: "/workspaces/analytics" },
    ],
  },
  {
    title: "Customers",
    items: [
      { id: "workspace-customer", label: "Customer Workspace", icon: <Building2 size={16} />, href: "/workspaces/customer" },
      { id: "sales-by-rep", label: "Sales by Rep", icon: <Target size={16} />, href: "/workspaces/sales-by-rep" },
      { id: "crm", label: "CRM", icon: <Users size={16} />, href: "/workspaces/crm" },
      { id: "contracts", label: "Contracts", icon: <FileSignature size={16} />, href: "/workspaces/contracts" },
      { id: "quotations", label: "Quotations", icon: <FileText size={16} />, href: "/workspaces/quotations" },
    ],
  },
  {
    title: "Operations",
    items: [
      { id: "workspace-job-orders", label: "Job Orders", icon: <FolderKanban size={16} />, href: "/workspaces/job-orders" },
      { id: "production", label: "Production", icon: <Factory size={16} />, href: "/workspaces/production" },
      { id: "workspace-machine", label: "Machines", icon: <Wrench size={16} />, href: "/workspaces/machine" },
      { id: "maintenance", label: "Maintenance", icon: <ClipboardList size={16} />, href: "/workspaces/maintenance" },
      { id: "installation", label: "Installation", icon: <Truck size={16} />, href: "/workspaces/installation" },
    ],
  },
  {
    title: "Manufacturing",
    items: [
      { id: "workspace-raw-material", label: "Materials", icon: <Package size={16} />, href: "/workspaces/raw-material" },
      { id: "inventory", label: "Inventory", icon: <Boxes size={16} />, href: "/workspaces/inventory" },
      { id: "procurement", label: "Procurement", icon: <ShoppingCart size={16} />, href: "/workspaces/procurement" },
      { id: "purchase-register", label: "Purchase Register", icon: <Receipt size={16} />, href: "/workspaces/purchase-register" },
      { id: "suppliers", label: "Suppliers", icon: <Handshake size={16} />, href: "/workspaces/suppliers" },
      { id: "costing", label: "Costing", icon: <Calculator size={16} />, href: "/workspaces/costing" },
    ],
  },
  {
    title: "Knowledge",
    items: [
      { id: "documents", label: "Documents", icon: <FileStack size={16} />, href: "/workspaces/documents" },
      { id: "drawings", label: "Drawings", icon: <PenTool size={16} />, href: "/workspaces/drawings" },
      { id: "sops", label: "SOPs", icon: <ListChecks size={16} />, href: "/workspaces/sops" },
      { id: "lessons-learned", label: "Lessons Learned", icon: <Lightbulb size={16} />, href: "/workspaces/lessons-learned" },
      { id: "ai-knowledge", label: "AI Knowledge", icon: <Share2 size={16} />, href: "/workspaces/ai-knowledge" },
    ],
  },
  {
    title: "Admin",
    items: [
      { id: "people", label: "People", icon: <UserRound size={16} />, href: "/workspaces/people" },
      { id: "finance", label: "Finance", icon: <Landmark size={16} />, href: "/workspaces/finance" },
      { id: "compliance", label: "Compliance", icon: <ShieldCheck size={16} />, href: "/workspaces/compliance" },
      { id: "administration", label: "Administration", icon: <Settings size={16} />, href: "/workspaces/administration" },
    ],
  },
  {
    title: "Tools",
    items: [
      { id: "site-surveys", label: "Site Surveys", icon: <FileText size={16} />, href: "/workspaces/site-surveys" },
      { id: "sign-estimator", label: "Sign Estimator", icon: <Ruler size={16} />, href: "/workspaces/sign-estimator" },
      { id: "installation-report", label: "Installation Report", icon: <Camera size={16} />, href: "/workspaces/installation-report" },
      { id: "cut-file-tool", label: "Cut File Tool", icon: <Scissors size={16} />, href: "/workspaces/cut-file-tool" },
      { id: "qr-label-tool", label: "QR Label Tool", icon: <QrCode size={16} />, href: "/workspaces/qr-label-tool" },
      { id: "estimate-builder", label: "Estimate Builder", icon: <FileSpreadsheet size={16} />, href: "/workspaces/estimate-builder" },
      { id: "cost-sheet", label: "Cost Sheet", icon: <Layers size={16} />, href: "/workspaces/cost-sheet" },
      { id: "material-ordering", label: "Material Ordering", icon: <PackageCheck size={16} />, href: "/workspaces/material-ordering" },
    ],
  },
];

// Shared by AppShell's own sidebar AND the home page's icon-grid tiles (see
// src/app/page.tsx) so the two surfaces can never drift apart -- a section
// gated out by allowed_groups, or a Tools-section item gated out by
// allowed_tools, disappears from both consistently. Sections are filtered
// whole (no per-item gating there, see SECTION_GROUP's own comment); Tools
// is the one section with per-item gating, via allowed_tools.
export function getVisibleNav(role: UserRole | null, allowedGroups: string[] | null, allowedTools: string[] | null): SidebarSection[] {
  return NAV.filter((section) => {
    const group = SECTION_GROUP[section.title];
    if (!group) return true;
    return canAccessGroup(role, allowedGroups, group);
  }).map((section) =>
    section.title === "Tools"
      ? { ...section, items: section.items.filter((item) => canAccessTool(role, allowedTools, item.id)) }
      : section
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [aiOpen, setAiOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  // Same recipient concept as the dedicated AI Copilot workspace page --
  // lives in the drawer, not the conversation (gmail-plan-v2.md section 4).
  const [recipient, setRecipient] = useState<PickedContact | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [allowedGroups, setAllowedGroups] = useState<string[] | null>(null);
  const [allowedTools, setAllowedTools] = useState<string[] | null>(null);

  useEffect(() => {
    async function loadRole(userId: string) {
      // Tolerant fetch: the `profiles` table (or its allowed_groups column)
      // may not exist yet if the relevant migration hasn't been run in
      // production yet. Any error or missing row/column just leaves both
      // userRole and allowedGroups at their fail-open defaults (null),
      // which every consumer treats as "don't restrict anything" — this
      // must never break the app for people signed in before a migration
      // runs.
      const { data, error } = await supabase
        .from("profiles")
        .select("role, allowed_groups")
        .eq("id", userId)
        .maybeSingle();
      if (!error && data) {
        setUserRole(data.role as UserRole);
        setAllowedGroups((data as { allowed_groups?: string[] | null }).allowed_groups ?? null);
      }

      // Separate, independently-tolerant fetch for allowed_tools -- kept
      // apart from the query above so that if supabase-tool-access-
      // migration.sql hasn't been run yet in production (column doesn't
      // exist), only tool access falls back to unrestricted -- it must
      // never take role/allowed_groups down with it, since those are
      // already relied on today.
      const { data: toolsData, error: toolsError } = await supabase
        .from("profiles")
        .select("allowed_tools")
        .eq("id", userId)
        .maybeSingle();
      if (!toolsError && toolsData) {
        setAllowedTools((toolsData as { allowed_tools?: string[] | null }).allowed_tools ?? null);
      }
    }

    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
      if (data.user) loadRole(data.user.id);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
      if (session?.user) {
        loadRole(session.user.id);
      } else {
        setUserRole(null);
        setAllowedGroups(null);
        setAllowedTools(null);
      }
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  // Safety net beyond Sidebar's own close-on-navigate: covers back/forward
  // and any programmatic navigation that doesn't go through a nav-item click.
  // Deliberately synchronizing UI state to a route change, not a render-time
  // derivation -- there's no prop/state combination to compute this from.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNavOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  // Falls back to "" (nothing highlighted) rather than "home" for pages
  // that aren't in the sidebar at all, like /account — reached only via the
  // avatar menu in TopNav, not a workspace someone navigates to directly.
  const activeId = NAV.flatMap((s) => s.items).find((i) => i.href === pathname)?.id ?? "";

  // /login renders its own full-page layout — no sidebar/topnav chrome.
  if (pathname === "/login") {
    return <>{children}</>;
  }

  // Filter out sidebar sections the current user isn't scoped into (and,
  // within Tools, individual tools they don't have access to). Admins and
  // unrestricted users (allowedGroups/allowedTools === null) see everything,
  // unchanged from before this feature existed.
  const visibleNav = getVisibleNav(userRole, allowedGroups, allowedTools);

  const navigateCommands: Command[] = visibleNav.flatMap((s) =>
    s.items.map((item) => ({
      id: item.id,
      label: `Go to ${item.label}`,
      group: "Navigate" as const,
      icon: item.icon,
      onRun: () => router.push(item.href),
    }))
  );

  const commands: Command[] = navigateCommands.concat([
    {
      id: "toast-demo",
      label: "Show a sample notification",
      group: "Actions" as const,
      icon: <Bell size={14} />,
      onRun: () => toast("success", "Purchase Order PO-MU-2026-004521 sent to Supplier X"),
    },
  ]);

  // Same backend as the dedicated AI Copilot workspace (src/app/workspaces/ai-copilot/page.tsx)
  // — this drawer is meant to be "the same assistant available from every workspace" (see
  // that page's own subtitle), so it hits the same /api/ai-copilot route instead of a
  // separate, disconnected demo response. Conversation history/loading state live here in
  // AppShell rather than that page specifically, since this drawer persists across navigation.
  async function handleSend(message: string) {
    const userTurn: ChatTurn = { id: crypto.randomUUID(), role: "user", content: message };
    const history = [...turns, userTurn];
    setTurns(history);
    setAiLoading(true);

    try {
      const res = await fetch("/api/ai-copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((t) => ({ role: t.role, content: t.content })),
          to: recipient ? { contactId: recipient.contactId } : undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "not_configured") {
          toast("warning", "AI Copilot isn't set up yet — add ANTHROPIC_API_KEY in Vercel to enable it.");
        } else {
          toast("danger", data.message ?? "The AI Copilot couldn't answer that — try again.");
        }
        return;
      }

      setTurns((t) => [
        ...t,
        { id: crypto.randomUUID(), role: "assistant", content: data.content, citations: data.citations },
      ]);
    } catch {
      toast("danger", "Couldn't reach the AI Copilot — check your connection and try again.");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <UserRoleContext.Provider value={userRole}>
    <UserGroupsContext.Provider value={allowedGroups}>
    <UserToolsContext.Provider value={allowedTools}>
      <div className="flex h-screen flex-col print:block print:h-auto">
        {/* Chrome (top nav + sidebar) is app furniture, never part of a
            printed report -- window.print() otherwise captures the whole
            viewport including these, which is what made printed cost sheets
            balloon to multiple pages with the sidebar re-tiled on each one. */}
        <div className="print:hidden">
          <TopNav
            onOpenNav={() => setNavOpen(true)}
            onOpenSearch={() => setPaletteOpen(true)}
            onOpenAI={() => setAiOpen(true)}
            notificationCount={3}
            userEmail={userEmail}
            userRole={userRole}
            onSignOut={handleSignOut}
            onOpenAccount={() => router.push("/account")}
          />
        </div>
        <div className="flex flex-1 overflow-hidden print:block print:overflow-visible">
          <div className="print:hidden">
            <Sidebar
              sections={visibleNav}
              activeId={activeId}
              onNavigate={(id) => {
                const item = NAV.flatMap((s) => s.items).find((i) => i.id === id);
                if (item) router.push(item.href);
              }}
              mobileOpen={navOpen}
              onMobileClose={() => setNavOpen(false)}
            />
          </div>
          <main className="flex-1 overflow-y-auto bg-surface-sunken p-4 sm:p-6 print:overflow-visible print:bg-white print:p-0">
            <div className="mx-auto max-w-6xl print:mx-0 print:max-w-none">{children}</div>
          </main>
        </div>
        <CommandPalette
          commands={commands}
          onAskAI={(q) => { setAiOpen(true); if (q) handleSend(q); }}
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
        />
        <Drawer open={aiOpen} onClose={() => setAiOpen(false)} title="AI Assistant" wide>
          <div className="mb-3 flex items-center justify-end">
            <ContactPicker selected={recipient} onSelect={setRecipient} />
          </div>
          <AIConversation turns={turns} onSend={handleSend} loading={aiLoading} />
        </Drawer>
      </div>
    </UserToolsContext.Provider>
    </UserGroupsContext.Provider>
    </UserRoleContext.Provider>
  );
}
