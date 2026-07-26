"use client";

import { PageHeader, DemoSection } from "@/components/DemoSection";
import { Timeline } from "@/components/ui/Timeline";
import { ActivityFeed } from "@/components/ui/ActivityFeed";
import { Table, type TableColumn } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Kanban, type KanbanColumn } from "@/components/ui/Kanban";
import { BarChart, LineChart, DonutChart, GaugeChart, Heatmap } from "@/components/ui/Charts";
import { TreeView, type TreeNode } from "@/components/ui/TreeView";
import { Calendar, type CalendarEvent } from "@/components/ui/Calendar";
import { VersionHistory } from "@/components/ui/VersionHistory";
import { WorkflowTimeline } from "@/components/ui/WorkflowTimeline";
import { useToast } from "@/components/ui/Notifications";

interface Order {
  id: string;
  number: string;
  customer: string;
  value: string;
  status: "success" | "warning" | "danger" | "info" | "neutral";
}

const ORDERS: Order[] = [
  { id: "1", number: "SO-MU-2026-007812", customer: "Reliance Retail", value: "₹12,40,000", status: "success" },
  { id: "2", number: "SO-MU-2026-007813", customer: "IKEA India", value: "₹8,90,500", status: "warning" },
  { id: "3", number: "SO-MU-2026-007814", customer: "Godrej Interio", value: "₹3,20,000", status: "info" },
  { id: "4", number: "SO-MU-2026-007815", customer: "Urban Ladder", value: "₹1,15,000", status: "danger" },
];

const ORDER_COLUMNS: TableColumn<Order>[] = [
  { key: "number", header: "Order #", sortable: true },
  { key: "customer", header: "Customer", sortable: true },
  { key: "value", header: "Value", sortable: true },
  { key: "status", header: "Status", render: (r) => <Badge status={r.status}>{r.status}</Badge> },
];

const KANBAN_COLUMNS: KanbanColumn[] = [
  { id: "new", title: "New", cards: [{ id: "c1", title: "SO-007816 — Pepperfry", meta: "₹4.2L" }, { id: "c2", title: "SO-007817 — Nilkamal" }] },
  { id: "progress", title: "In Progress", cards: [{ id: "c3", title: "SO-007810 — IKEA India", meta: "₹8.9L", aiSuggestedColumn: "review" }] },
  { id: "review", title: "Review", cards: [{ id: "c4", title: "SO-007805 — Reliance Retail" }] },
  { id: "done", title: "Done", cards: [{ id: "c5", title: "SO-007790 — Godrej Interio" }] },
];

const TREE: TreeNode[] = [
  {
    id: "org",
    label: "MMDI Pvt Ltd",
    children: [
      { id: "mfg", label: "Manufacturing", children: [{ id: "line1", label: "Line 1" }, { id: "line2", label: "Line 2" }, { id: "line3", label: "Line 3" }] },
      { id: "sales", label: "Sales & Marketing", children: [{ id: "north", label: "North Region" }, { id: "west", label: "West Region" }] },
      { id: "qa", label: "Quality Assurance" },
    ],
  },
];

const EVENTS: CalendarEvent[] = [
  { id: "e1", day: 3, title: "PM — Machine M-14", type: "pm" },
  { id: "e2", day: 8, title: "Installation — Reliance site", type: "installation" },
  { id: "e3", day: 8, title: "Dentist", type: "personal" },
  { id: "e4", day: 15, title: "PM — Machine M-08", type: "pm" },
  { id: "e5", day: 21, title: "Two site visits overlap", type: "conflict" },
];

export default function DataPage() {
  const { toast } = useToast();

  return (
    <div>
      <PageHeader
        title="Data & Structure"
        description="Components for chronological history, tabular records, board views, charts, hierarchy, scheduling and versioning."
      />

      <DemoSection title="Timeline" deliverable="Deliverable 3.3" description="The audit variant reuses the same component with a monospace, tagged style — visually distinct from the business timeline it also renders.">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
          <Timeline entries={[
            { id: "t1", date: "12 Jul 2026", title: "Order confirmed", description: "Customer approved final BOM." },
            { id: "t2", date: "10 Jul 2026", title: "Quote revised", description: "Pricing updated after material cost change." },
            { id: "t3", date: "2 Jul 2026", title: "Quote sent" },
          ]} />
          <Timeline audit entries={[
            { id: "a1", date: "2026-07-12T14:02:11Z", title: "field.status changed: quoted → confirmed" },
            { id: "a2", date: "2026-07-10T09:41:03Z", title: "field.unit_price changed: 118.50 → 124.00" },
          ]} />
        </div>
      </DemoSection>

      <DemoSection title="Activity Feed" deliverable="Deliverable 3.3" description="Cross-record recent activity, rankable by AI-estimated relevance rather than strict recency.">
        <ActivityFeed items={[
          { id: "1", actor: "Priya Nair", action: "approved", target: "PO-MU-2026-004521", time: "2m ago" },
          { id: "2", actor: "AI Assistant", action: "flagged a shortage risk on", target: "RM-0231", time: "18m ago", aiRanked: true },
          { id: "3", actor: "Arjun Rao", action: "updated the BOM for", target: "SKU-88231", time: "1h ago" },
        ]} />
      </DemoSection>

      <DemoSection title="Table" deliverable="Deliverable 3.3" description="Client-side sortable columns, custom cell rendering, comfortable/compact density.">
        <Table columns={ORDER_COLUMNS} rows={ORDERS} onRowClick={(r) => toast("info", `Opened ${r.number}`)} />
      </DemoSection>

      <DemoSection title="Kanban" deliverable="Deliverable 3.3" description="Drag a card between columns — status change fires the same workflow an edit form would.">
        <Kanban initialColumns={KANBAN_COLUMNS} />
      </DemoSection>

      <DemoSection title="Charts" deliverable="Deliverable 3.3" description="Dependency-free SVG charts, each paired with an sr-only accessible data table.">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
          <div>
            <h4 className="mb-2 text-xs font-semibold text-ink-muted">Bar — Orders by Region</h4>
            <BarChart data={[{ label: "North", value: 42 }, { label: "West", value: 68 }, { label: "South", value: 35 }, { label: "East", value: 21 }]} />
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold text-ink-muted">Line — OEE Trend (7 days)</h4>
            <LineChart data={[{ label: "Mon", value: 74 }, { label: "Tue", value: 71 }, { label: "Wed", value: 69 }, { label: "Thu", value: 72 }, { label: "Fri", value: 65 }, { label: "Sat", value: 78 }, { label: "Sun", value: 80 }]} />
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold text-ink-muted">Donut — Order Status Mix</h4>
            <DonutChart data={[{ label: "Confirmed", value: 44, color: "success" }, { label: "Pending", value: 22, color: "warning" }, { label: "At Risk", value: 8, color: "danger" }, { label: "Draft", value: 12, color: "info" }]} />
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold text-ink-muted">Gauge — Machine OEE</h4>
            <GaugeChart value={71} label="Line 3, Machine M-14" />
          </div>
          <div className="sm:col-span-2">
            <h4 className="mb-2 text-xs font-semibold text-ink-muted">Heatmap — Defect Rate by Line / Shift</h4>
            <Heatmap rows={["Line 1", "Line 2", "Line 3"]} cols={["Shift A", "Shift B", "Shift C"]} values={[[2, 4, 1], [6, 3, 5], [1, 2, 9]]} />
          </div>
        </div>
      </DemoSection>

      <DemoSection title="Tree View" deliverable="Deliverable 3.3" description="Hierarchical navigation for org structure, cost-center roll-ups, and BOM explosion.">
        <TreeView nodes={TREE} />
      </DemoSection>

      <DemoSection title="Calendar" deliverable="Deliverable 3.3" description="Month grid and an Agenda list view — Agenda is the accessible default.">
        <Calendar daysInMonth={31} events={EVENTS} />
      </DemoSection>

      <DemoSection title="Version History" deliverable="Deliverable 3.3" description="Select two versions to see an AI-generated summary of what changed between them.">
        <VersionHistory versions={[
          { id: "v4", label: "Version 4", date: "12 Jul 2026", author: "Priya Nair" },
          { id: "v3", label: "Version 3", date: "2 Jun 2026", author: "Arjun Rao" },
          { id: "v2", label: "Version 2", date: "14 Apr 2026", author: "Priya Nair" },
          { id: "v1", label: "Version 1 (initial)", date: "3 Jan 2026", author: "Arjun Rao" },
        ]} />
      </DemoSection>

      <DemoSection title="Workflow Timeline" deliverable="Deliverable 3.3" description="Always reflects a defined Approval Matrix workflow, never free-form activity.">
        <WorkflowTimeline stages={[
          { id: "s1", label: "Submitted", status: "complete", actor: "Arjun Rao", timestamp: "10 Jul" },
          { id: "s2", label: "Manager Review", status: "complete", actor: "Priya Nair", timestamp: "11 Jul" },
          { id: "s3", label: "Plant Head Approval", status: "current" },
          { id: "s4", label: "Finance Sign-off", status: "upcoming" },
        ]} />
      </DemoSection>
    </div>
  );
}
