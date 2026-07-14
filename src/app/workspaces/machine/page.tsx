"use client";

import { useState } from "react";
import { Wrench, Pencil, CalendarClock, PackageSearch } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { Tabs } from "@/components/ui/Tabs";
import { StatCard, AICard } from "@/components/ui/Card";
import { Timeline } from "@/components/ui/Timeline";
import { ActivityFeed } from "@/components/ui/ActivityFeed";
import { LineChart, GaugeChart, Heatmap } from "@/components/ui/Charts";
import { DocumentPreview, CADViewer } from "@/components/ui/Viewers";
import { Comments, type Comment } from "@/components/ui/Comments";
import { ApprovalPanel } from "@/components/ui/ApprovalPanel";
import { RelationshipGraph, type GraphNode, type GraphEdge } from "@/components/ui/RelationshipGraph";
import { PromptInput } from "@/components/ui/PromptInput";
import { useToast } from "@/components/ui/Notifications";

const NODES: GraphNode[] = [
  { id: "center", label: "Machine M-14", type: "Machine" },
  { id: "n1", label: "Line 3", type: "Production Line" },
  { id: "n2", label: "NCR-2025-0442", type: "Lesson Learned" },
  { id: "n3", label: "RM-0231 — PVC-Free Vinyl", type: "Raw Material" },
  { id: "n4", label: "Arjun Rao", type: "Maintenance Lead" },
  { id: "n5", label: "IKEA Wardrobe Program", type: "Project" },
];

const EDGES: GraphEdge[] = [
  { from: "center", to: "n1", label: "runs on" },
  { from: "center", to: "n2", label: "related incident" },
  { from: "center", to: "n3", label: "processes" },
  { from: "center", to: "n4", label: "maintained by" },
  { from: "center", to: "n5", label: "allocated to" },
];

const INITIAL_COMMENTS: Comment[] = [
  { id: "c1", author: "Arjun Rao", content: "Vibration sensor on the tie-bar is trending up again — same pattern as before the Q1 bearing failure.", time: "6 hours ago" },
  { id: "c2", author: "AI Assistant", content: "Confirmed: current vibration signature matches 84% of the pre-failure window from NCR-2025-0442.", time: "5 hours ago" },
];

export default function MachineWorkspacePage() {
  const { toast } = useToast();
  const [comments, setComments] = useState(INITIAL_COMMENTS);
  const [center, setCenter] = useState(NODES[0]);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Machines", href: "/workspaces/machine" }, { label: "Machine M-14" }]} />

      {/* Workspace header */}
      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-warning-tint text-warning">
            <Wrench size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Injection Molding Machine M-14</h1>
              <Badge status="warning">PM Due</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Machine — MC-MU-000891 · Line 3 · Maintenance lead: Arjun Rao</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag>Line 3</Tag>
              <Tag>Installed 2019</Tag>
              <Tag>Vendor: Sumitomo Demag</Tag>
              <Tag aiSuggested>Predicted bearing failure risk — 12 days</Tag>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => toast("info", "Opening edit form for Machine M-14")}>
            <Pencil size={14} className="mr-1.5" /> Edit
          </Button>
          <ContextMenu
            items={[
              { label: "Schedule PM", icon: <CalendarClock size={13} />, onSelect: () => toast("success", "PM scheduled for Machine M-14") },
              { label: "Request spare part", icon: <PackageSearch size={13} />, onSelect: () => toast("info", "Spare part request drafted") },
            ]}
          />
        </div>
      </div>

      {/* Stat row */}
      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="OEE" value="71%" trend="down" trendLabel="-4 pts vs target" aiInsight="Trending toward the 65% threshold that historically precedes a bearing failure on this machine." />
        <StatCard label="MTBF" value="412 h" trend="down" trendLabel="-38h vs last quarter" />
        <StatCard label="MTTR" value="3.2 h" trend="flat" trendLabel="No change" />
        <StatCard label="Uptime" value="92%" trend="up" trendLabel="+1 pt" />
      </div>

      <Tabs
        defaultId="overview"
        items={[
          {
            id: "overview",
            label: "Overview",
            content: (
              <div className="grid grid-cols-1 gap-6 pt-5 lg:grid-cols-3">
                <div className="flex flex-col gap-4 lg:col-span-2">
                  <AICard
                    variant="recommendation"
                    title="Predictive maintenance alert — bearing failure risk"
                    citation="Vibration sensor telemetry, last 30 days"
                    onAccept={() => toast("success", "Maintenance work order created")}
                    onDismiss={() => toast("info", "Dismissed")}
                  >
                    Vibration signature on the tie-bar now matches 84% of the pattern observed before the Q1 bearing failure (NCR-2025-0442). Estimated 12 days to failure at current degradation rate — recommend scheduling PM before the next production run.
                  </AICard>
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Ask about this machine</h3>
                    <PromptInput
                      placeholder='e.g. "What caused the last unplanned downtime?"'
                      onSubmit={(v) => toast("ai", `AI Assistant is looking into: "${v}"`)}
                    />
                  </div>
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Recent activity</h3>
                    <ActivityFeed
                      items={[
                        { id: "1", actor: "AI Assistant", action: "flagged a rising vibration trend on", target: "Machine M-14", time: "5h ago", aiRanked: true },
                        { id: "2", actor: "Arjun Rao", action: "logged an inspection note for", target: "Machine M-14", time: "1 day ago" },
                        { id: "3", actor: "System", action: "recorded a changeover on", target: "Machine M-14", time: "2 days ago" },
                      ]}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Machine spec</h3>
                    <ul className="flex flex-col gap-2 text-sm">
                      <li className="flex justify-between"><span className="text-ink-secondary">Model</span><span className="font-medium text-ink">Sumitomo SE180D</span></li>
                      <li className="flex justify-between"><span className="text-ink-secondary">Clamping force</span><span className="font-medium text-ink">180 tons</span></li>
                      <li className="flex justify-between"><span className="text-ink-secondary">Shot weight max</span><span className="font-medium text-ink">420 g</span></li>
                      <li className="flex justify-between"><span className="text-ink-secondary">Last PM</span><span className="font-medium text-ink">14 Apr 2026</span></li>
                    </ul>
                  </div>
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Current OEE</h3>
                    <div className="flex justify-center">
                      <GaugeChart value={71} label="Line 3, Machine M-14" />
                    </div>
                  </div>
                </div>
              </div>
            ),
          },
          {
            id: "insights",
            label: "Insights",
            content: (
              <div className="grid grid-cols-1 gap-6 pt-5 sm:grid-cols-2">
                <div className="rounded-lg border border-line bg-surface p-4">
                  <h3 className="mb-3 text-sm font-semibold text-ink">OEE trend — 7 days</h3>
                  <LineChart data={[{ label: "Mon", value: 74 }, { label: "Tue", value: 71 }, { label: "Wed", value: 69 }, { label: "Thu", value: 72 }, { label: "Fri", value: 65 }, { label: "Sat", value: 68 }, { label: "Sun", value: 71 }]} />
                </div>
                <div className="rounded-lg border border-line bg-surface p-4">
                  <h3 className="mb-3 text-sm font-semibold text-ink">Downtime by shift &amp; cause</h3>
                  <Heatmap rows={["Shift A", "Shift B", "Shift C"]} cols={["Changeover", "Breakdown", "Material Wait"]} values={[[3, 1, 2], [2, 4, 1], [4, 6, 3]]} />
                </div>
                <div className="sm:col-span-2">
                  <AICard variant="insight" title="Shift C is the primary downtime driver" citation="Downtime log, last 30 days">
                    Shift C accounts for 46% of total unplanned downtime on this machine, concentrated in breakdowns rather than changeovers — worth reviewing operator handover procedure at the Shift B/C boundary.
                  </AICard>
                </div>
              </div>
            ),
          },
          {
            id: "timeline",
            label: "Timeline",
            content: (
              <div className="pt-5">
                <Timeline
                  entries={[
                    { id: "t1", date: "14 Apr 2026", title: "Preventive maintenance completed", description: "Tie-bar bearings inspected and greased; no replacement needed at the time." },
                    { id: "t2", date: "2 Feb 2026", title: "Unplanned downtime — 4.5h", description: "Hydraulic seal failure, replaced under warranty." },
                    { id: "t3", date: "11 Jan 2026", title: "NCR-2025-0442 closed", description: "Root cause: worn locating pin, not operator error as initially logged." },
                    { id: "t4", date: "3 Sep 2019", title: "Machine commissioned on Line 3" },
                  ]}
                />
              </div>
            ),
          },
          {
            id: "documents",
            label: "Documents",
            content: (
              <div className="grid grid-cols-1 gap-4 pt-5 sm:grid-cols-2">
                <DocumentPreview title="SOP-0044 — Injection Molding Setup" summary="Standard operating procedure for setting up this machine class prior to a production run." tags={["SOP", "Rev 4"]} />
                <DocumentPreview title="Maintenance Manual — Sumitomo SE180D" summary="OEM service manual, including bearing replacement torque specs." tags={["OEM", "Reference"]} />
                <div className="sm:col-span-2">
                  <h3 className="mb-3 text-sm font-semibold text-ink">Tooling drawing — CAD viewer</h3>
                  <CADViewer layers={["Outline", "Mold Cavity", "Cooling Channels", "Ejector Pins"]} />
                </div>
              </div>
            ),
          },
          {
            id: "relationships",
            label: "Relationships",
            content: (
              <div className="pt-5">
                <RelationshipGraph
                  center={center}
                  nodes={NODES}
                  edges={EDGES}
                  onRecenter={(id) => {
                    const node = NODES.find((n) => n.id === id);
                    if (node) {
                      setCenter(node);
                      toast("ai", `Recentered on ${node.label}`);
                    }
                  }}
                />
              </div>
            ),
          },
          {
            id: "activity",
            label: "Activity",
            content: (
              <div className="flex flex-col gap-6 pt-5">
                <ApprovalPanel
                  title="Emergency PM — Machine M-14"
                  requestedBy="Arjun Rao, Maintenance Lead"
                  value="Bearing replacement — est. 6h downtime, ₹42,000"
                  aiRecommendation="Predicted failure window is 12 days out; scheduling now avoids an unplanned stoppage mid-run on the IKEA Wardrobe Program order."
                  stages={[
                    { id: "s1", label: "Submitted", status: "complete", actor: "Arjun Rao", timestamp: "Today" },
                    { id: "s2", label: "Plant Head Approval", status: "current" },
                    { id: "s3", label: "Scheduled", status: "upcoming" },
                  ]}
                  onApprove={() => toast("success", "Emergency PM approved and scheduled")}
                  onReject={() => toast("danger", "Emergency PM rejected")}
                  onDelegate={() => toast("info", "Delegated to Plant Engineering")}
                />
                <Comments
                  comments={comments}
                  onAdd={(text) => setComments((c) => [...c, { id: crypto.randomUUID(), author: "You", content: text, time: "just now" }])}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
