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
    title: "Flagship Workspaces",
    items: [
      { id: "workspace-customer", label: "Customer Workspace", icon: <Building2 size={16} />, href: "/workspaces/customer" },
      { id: "workspace-machine", label: "Machine Workspace", icon: <Wrench size={16} />, href: "/workspaces/machine" },
      { id: "workspace-raw-material", label: "Raw Material Workspace", icon: <Package size={16} />, href: "/workspaces/raw-material" },
    ],
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
