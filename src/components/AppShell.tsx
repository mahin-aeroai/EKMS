"use client";

import { useRouter, usePathname } from "next/navigation";
import {
  Palette,
  MousePointerClick,
  IdCard,
  Database,
  Navigation as NavIcon,
  Users,
  Bell,
  Sparkles,
  FileStack,
  Columns2,
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
} from "lucide-react";
import { Sidebar, type SidebarSection } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { CommandPalette, type Command } from "@/components/ui/CommandPalette";
import { useToast } from "@/components/ui/Notifications";
import { useEffect, useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { AIConversation, type ChatTurn } from "@/components/ui/AIConversation";
import { supabase, type UserRole } from "@/lib/supabase";
import { UserRoleContext } from "@/lib/UserRoleContext";
import { UserGroupsContext, canAccessGroup } from "@/lib/UserGroupsContext";

// Maps a NAV section's title to the group id used in profiles.allowed_groups
// (supabase-module-access-migration.sql). Sections not listed here (Overview,
// Foundations, Components, Executive) are never restricted -- see that
// migration's header comment for why Executive specifically stays ungated.
const SECTION_GROUP: Record<string, string> = {
  Customers: "customers",
  Operations: "operations",
  Manufacturing: "manufacturing",
  Knowledge: "knowledge",
  People: "people",
  Finance: "finance",
  Compliance: "compliance",
  Administration: "administration",
};

const NAV: SidebarSection[] = [
  {
    title: "Overview",
    items: [{ id: "home", label: "Design System Home", icon: <Home size={16} />, href: "/" }],
  },
  {
    title: "Foundations",
    items: [{ id: "foundations", label: "Tokens & Foundations", icon: <Palette size={16} />, href: "/foundations" }],
  },
  {
    title: "Components",
    items: [
      { id: "inputs", label: "Inputs & Actions", icon: <MousePointerClick size={16} />, href: "/components/inputs" },
      { id: "cards", label: "Cards", icon: <IdCard size={16} />, href: "/components/cards" },
      { id: "data", label: "Data & Structure", icon: <Database size={16} />, href: "/components/data" },
      { id: "navigation", label: "Navigation", icon: <NavIcon size={16} />, href: "/components/navigation" },
      { id: "collaboration", label: "Collaboration", icon: <Users size={16} />, href: "/components/collaboration" },
      { id: "feedback", label: "Feedback & Overlays", icon: <Bell size={16} />, href: "/components/feedback" },
      { id: "ai", label: "AI-Native", icon: <Sparkles size={16} />, href: "/components/ai" },
      { id: "viewers", label: "Document & Media Viewers", icon: <FileStack size={16} />, href: "/components/viewers" },
      { id: "layout", label: "Layout Primitives", icon: <Columns2 size={16} />, href: "/components/layout" },
    ],
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
      { id: "site-surveys", label: "Site Surveys", icon: <FileText size={16} />, href: "/workspaces/site-surveys" },
      { id: "crm", label: "CRM", icon: <Users size={16} />, href: "/workspaces/crm" },
      { id: "quotations", label: "Quotations", icon: <FileText size={16} />, href: "/workspaces/quotations" },
      { id: "sign-estimator", label: "Sign Estimator", icon: <Ruler size={16} />, href: "/workspaces/sign-estimator" },
      { id: "contracts", label: "Contracts", icon: <FileSignature size={16} />, href: "/workspaces/contracts" },
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
    title: "People",
    items: [{ id: "people", label: "People", icon: <UserRound size={16} />, href: "/workspaces/people" }],
  },
  {
    title: "Finance",
    items: [{ id: "finance", label: "Finance", icon: <Landmark size={16} />, href: "/workspaces/finance" }],
  },
  {
    title: "Compliance",
    items: [{ id: "compliance", label: "Compliance", icon: <ShieldCheck size={16} />, href: "/workspaces/compliance" }],
  },
  {
    title: "Administration",
    items: [{ id: "administration", label: "Administration", icon: <Settings size={16} />, href: "/workspaces/administration" }],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [aiOpen, setAiOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [allowedGroups, setAllowedGroups] = useState<string[] | null>(null);

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
      }
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const activeId = NAV.flatMap((s) => s.items).find((i) => i.href === pathname)?.id ?? "home";

  // /login renders its own full-page layout — no sidebar/topnav chrome.
  if (pathname === "/login") {
    return <>{children}</>;
  }

  // Filter out sidebar sections the current user isn't scoped into. Admins
  // and unrestricted users (allowedGroups === null) see every section,
  // unchanged from before this feature existed.
  const visibleNav = NAV.filter((section) => {
    const group = SECTION_GROUP[section.title];
    if (!group) return true;
    return canAccessGroup(userRole, allowedGroups, group);
  });

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
        body: JSON.stringify({ messages: history.map((t) => ({ role: t.role, content: t.content })) }),
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
      <div className="flex h-screen flex-col">
        <TopNav
          onOpenAI={() => setAiOpen(true)}
          notificationCount={3}
          userEmail={userEmail}
          userRole={userRole}
          onSignOut={handleSignOut}
        />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar sections={visibleNav} activeId={activeId} onNavigate={(id) => {
            const item = NAV.flatMap((s) => s.items).find((i) => i.id === id);
            if (item) router.push(item.href);
          }} />
          <main className="flex-1 overflow-y-auto bg-surface-sunken p-6">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
        <CommandPalette commands={commands} onAskAI={(q) => { setAiOpen(true); if (q) handleSend(q); }} />
        <Drawer open={aiOpen} onClose={() => setAiOpen(false)} title="AI Assistant" wide>
          <AIConversation turns={turns} onSend={handleSend} loading={aiLoading} />
        </Drawer>
      </div>
    </UserGroupsContext.Provider>
    </UserRoleContext.Provider>
  );
}
