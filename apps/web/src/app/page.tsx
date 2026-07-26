import Link from "next/link";
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
} from "lucide-react";

const SECTIONS = [
  { href: "/foundations", icon: Palette, label: "Foundations", desc: "Color, typography, spacing, elevation, motion & icon tokens." },
  { href: "/components/inputs", icon: MousePointerClick, label: "Inputs & Actions", desc: "Button, Dropdown, Tag, Badge, Prompt Input, Tooltip." },
  { href: "/components/cards", icon: IdCard, label: "Cards", desc: "Card, StatCard, AICard, EntityCard, SearchCard, KnowledgeCard, CitationCard." },
  { href: "/components/data", icon: Database, label: "Data & Structure", desc: "Timeline, Activity Feed, Table, Kanban, Charts, Tree View, Calendar, Version History, Workflow Timeline." },
  { href: "/components/navigation", icon: NavIcon, label: "Navigation", desc: "Breadcrumbs, Tabs, Search Results — plus Sidebar, Command Palette & Top Nav in the app shell." },
  { href: "/components/collaboration", icon: Users, label: "Collaboration", desc: "Comments and the Approval Panel." },
  { href: "/components/feedback", icon: Bell, label: "Feedback & Overlays", desc: "Notifications, Dialog, Drawer, Context Menu." },
  { href: "/components/ai", icon: Sparkles, label: "AI-Native", desc: "AI Conversation and the Relationship Graph." },
  { href: "/components/viewers", icon: FileStack, label: "Document & Media Viewers", desc: "Document Preview, Image Viewer, PDF Viewer, CAD Viewer." },
  { href: "/components/layout", icon: Columns2, label: "Layout Primitives", desc: "Split View and the Widget / Widget Grid." },
];

export default function Home() {
  return (
    <div>
      <div className="mb-10 border-b border-line pb-8">
        <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-ai-tint px-3 py-1 text-xs font-medium text-ai">
          <Sparkles size={12} /> AI-native by design
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">MMDI ONE Product Design System</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-secondary">
          The living component library behind MMDI ONE — the design language, not a set of mockups. Every
          component below is real, interactive React + TypeScript + Tailwind, wired to the token system and
          themeable across Light, Dark and Enterprise Kiosk modes using the switcher in the top nav.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map(({ href, icon: Icon, label, desc }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col gap-3 rounded-lg border border-line bg-surface p-5 shadow-1 transition-colors hover:border-primary"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-tint text-primary">
              <Icon size={18} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-ink group-hover:text-primary">{label}</h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-secondary">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
