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
} from "lucide-react";
import { Sidebar, type SidebarSection } from "@/components/ui/Sidebar";
import { TopNav } from "@/components/ui/TopNav";
import { CommandPalette, type Command } from "@/components/ui/CommandPalette";
import { useToast } from "@/components/ui/Notifications";
import { useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { AIConversation, type ChatTurn } from "@/components/ui/AIConversation";

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
      { id: "crm", label: "CRM", icon: <Users size={16} />, href: "/workspaces/crm" },
      { id: "quotations", label: "Quotations", icon: <FileText size={16} />, href: "/workspaces/quotations" },
      { id: "contracts", label: "Contracts", icon: <FileSignature size={16} />, href: "/workspaces/contracts" },
    ],
  },
  {
    title: "Operations",
    items: [
      { id: "workspace-project", label: "Projects", icon: <FolderKanban size={16} />, href: "/workspaces/project" },
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

  const activeId = NAV.flatMap((s) => s.items).find((i) => i.href === pathname)?.id ?? "home";

  const navigateCommands: Command[] = NAV.flatMap((s) =>
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

  function handleSend(message: string) {
    setTurns((t) => [
      ...t,
      { id: crypto.randomUUID(), role: "user", content: message },
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "This is a demo response showing the AI Conversation component's shape — citations, confidence and feedback controls all render exactly as they would against live data.",
        citations: ["Customer Master — Reliance Retail", "Sales Order SO-MU-2026-007812"],
      },
    ]);
  }

  return (
    <div className="flex h-screen flex-col">
      <TopNav onOpenAI={() => setAiOpen(true)} notificationCount={3} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar sections={NAV} activeId={activeId} onNavigate={(id) => {
          const item = NAV.flatMap((s) => s.items).find((i) => i.id === id);
          if (item) router.push(item.href);
        }} />
        <main className="flex-1 overflow-y-auto bg-surface-sunken p-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
      <CommandPalette commands={commands} onAskAI={(q) => { setAiOpen(true); if (q) handleSend(q); }} />
      <Drawer open={aiOpen} onClose={() => setAiOpen(false)} title="AI Assistant" wide>
        <AIConversation turns={turns} onSend={handleSend} />
      </Drawer>
    </div>
  );
}
