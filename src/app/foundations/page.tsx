import { PageHeader, DemoSection } from "@/components/DemoSection";
import {
  Package,
  Truck,
  Wrench,
  FolderKanban,
  Search,
  Bell,
  Sparkles,
  Settings,
} from "lucide-react";

const COLOR_GROUPS: { title: string; swatches: { name: string; className: string }[] }[] = [
  {
    title: "Surfaces",
    swatches: [
      { name: "surface", className: "bg-surface border border-line" },
      { name: "surface-raised", className: "bg-surface-raised border border-line" },
      { name: "surface-sunken", className: "bg-surface-sunken border border-line" },
      { name: "surface-overlay", className: "bg-surface-overlay border border-line" },
    ],
  },
  {
    title: "Ink (text)",
    swatches: [
      { name: "ink", className: "bg-ink" },
      { name: "ink-secondary", className: "bg-ink-secondary" },
      { name: "ink-muted", className: "bg-ink-muted" },
      { name: "on-brand", className: "bg-on-brand border border-line" },
    ],
  },
  {
    title: "Lines",
    swatches: [
      { name: "line", className: "bg-line" },
      { name: "line-strong", className: "bg-line-strong" },
    ],
  },
  {
    title: "Brand & Semantic",
    swatches: [
      { name: "primary", className: "bg-primary" },
      { name: "primary-hover", className: "bg-primary-hover" },
      { name: "primary-tint", className: "bg-primary-tint border border-line" },
      { name: "ai", className: "bg-ai" },
      { name: "ai-tint", className: "bg-ai-tint border border-line" },
    ],
  },
  {
    title: "Status",
    swatches: [
      { name: "success", className: "bg-success" },
      { name: "warning", className: "bg-warning" },
      { name: "danger", className: "bg-danger" },
      { name: "info", className: "bg-info" },
    ],
  },
];

const RADII = [
  { name: "radius-sm", className: "rounded-sm" },
  { name: "radius-md", className: "rounded-md" },
  { name: "radius-lg", className: "rounded-lg" },
  { name: "radius-full", className: "rounded-full" },
];

const SHADOWS = [
  { name: "shadow-1", className: "shadow-1" },
  { name: "shadow-2", className: "shadow-2" },
  { name: "shadow-3", className: "shadow-3" },
  { name: "shadow-4", className: "shadow-4" },
];

const ICONS = [
  { Icon: Package, label: "Raw Material" },
  { Icon: Truck, label: "Logistics" },
  { Icon: Wrench, label: "Machine" },
  { Icon: FolderKanban, label: "Project" },
  { Icon: Search, label: "Search" },
  { Icon: Bell, label: "Notification" },
  { Icon: Sparkles, label: "AI" },
  { Icon: Settings, label: "Configuration" },
];

export default function FoundationsPage() {
  return (
    <div>
      <PageHeader
        title="Foundations"
        description="The design tokens every component is built from. Switch themes (Light / Dark / Enterprise) in the top nav — every swatch below re-renders live because nothing here is hardcoded."
      />

      <DemoSection title="Color" deliverable="Deliverable 2.1" description="Semantic color roles, not raw hex values — components reference roles like bg-primary or text-danger, never a specific shade.">
        <div className="flex flex-col gap-6">
          {COLOR_GROUPS.map((group) => (
            <div key={group.title}>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{group.title}</h4>
              <div className="flex flex-wrap gap-4">
                {group.swatches.map((s) => (
                  <div key={s.name} className="flex flex-col items-center gap-1.5">
                    <div className={`h-14 w-14 rounded-md ${s.className}`} />
                    <span className="text-[11px] text-ink-secondary">{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DemoSection>

      <DemoSection title="Typography" deliverable="Deliverable 2.2" description="A single type ramp shared by every workspace and dashboard.">
        <div className="flex flex-col gap-3">
          <p className="text-3xl font-semibold text-ink">Display — 30px / Semibold</p>
          <p className="text-2xl font-semibold text-ink">Heading 1 — 24px / Semibold</p>
          <p className="text-lg font-semibold text-ink">Heading 2 — 18px / Semibold</p>
          <p className="text-base font-medium text-ink">Heading 3 — 16px / Medium</p>
          <p className="text-sm text-ink">Body — 14px / Regular. The default reading size across every workspace.</p>
          <p className="text-xs text-ink-secondary">Caption — 12px / Regular, used for metadata and timestamps.</p>
          <p className="font-mono text-xs text-ink-secondary">Mono — used for audit history, IDs, and code.</p>
        </div>
      </DemoSection>

      <DemoSection title="Spacing scale" deliverable="Deliverable 2.3" description="4px base unit; components snap to this scale exclusively.">
        <div className="flex items-end gap-3">
          {[1, 2, 3, 4, 6, 8, 12, 16].map((n) => (
            <div key={n} className="flex flex-col items-center gap-1.5">
              <div className="bg-primary" style={{ width: n * 4, height: n * 4 }} />
              <span className="text-[11px] text-ink-muted">{n * 4}px</span>
            </div>
          ))}
        </div>
      </DemoSection>

      <DemoSection title="Radius" deliverable="Deliverable 2.4">
        <div className="flex flex-wrap gap-6">
          {RADII.map((r) => (
            <div key={r.name} className="flex flex-col items-center gap-1.5">
              <div className={`h-16 w-16 border-2 border-primary ${r.className}`} />
              <span className="text-[11px] text-ink-secondary">{r.name}</span>
            </div>
          ))}
        </div>
      </DemoSection>

      <DemoSection title="Elevation" deliverable="Deliverable 2.5" description="Shadow depth signals interaction layer — cards, dropdowns, drawers, and modals each sit at a defined tier.">
        <div className="flex flex-wrap gap-6">
          {SHADOWS.map((s) => (
            <div key={s.name} className={`flex h-16 w-24 items-center justify-center rounded-lg bg-surface text-[11px] text-ink-secondary ${s.className}`}>
              {s.name}
            </div>
          ))}
        </div>
      </DemoSection>

      <DemoSection title="Iconography" deliverable="Deliverable 2.6" description="Lucide's outline set, used at 14–20px, matched stroke-width across the platform.">
        <div className="flex flex-wrap gap-6">
          {ICONS.map(({ Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-1.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-md border border-line text-ink-secondary">
                <Icon size={18} />
              </span>
              <span className="text-[11px] text-ink-muted">{label}</span>
            </div>
          ))}
        </div>
      </DemoSection>

      <DemoSection title="Motion" deliverable="Deliverable 2.7" description="Micro (120ms) for hover/focus states, Standard (200ms) for component transitions, Page (320ms) for route changes — all eased with ease-out.">
        <div className="flex gap-4">
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-brand transition-transform duration-[var(--dur-micro)] ease-[var(--ease-out)] hover:scale-105">
            Hover me (micro)
          </button>
          <button className="rounded-md border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors duration-[var(--dur-standard)] ease-[var(--ease-out)] hover:bg-surface-sunken">
            Hover me (standard)
          </button>
        </div>
      </DemoSection>
    </div>
  );
}
