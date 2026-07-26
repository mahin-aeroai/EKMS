"use client";

import { PageHeader, DemoSection } from "@/components/DemoSection";
import { SplitView } from "@/components/ui/SplitView";
import { Widget, WidgetGrid } from "@/components/ui/Widget";
import { StatCard } from "@/components/ui/Card";
import { BarChart } from "@/components/ui/Charts";
import { useToast } from "@/components/ui/Notifications";

export default function LayoutPage() {
  const { toast } = useToast();

  return (
    <div>
      <PageHeader
        title="Layout Primitives"
        description="The two structural building blocks every Homepage, Dashboard, and browse-and-inspect view is composed from."
      />

      <DemoSection title="Split View" deliverable="Deliverable 3.9" description="Draggable divider (mouse or arrow keys) for a list-and-detail layout; collapses to a single pane on narrow viewports.">
        <SplitView
          initialLeftPct={35}
          left={
            <ul className="flex flex-col gap-1 text-sm">
              {["Reliance Retail Ltd", "IKEA India", "Godrej Interio", "Urban Ladder"].map((c) => (
                <li key={c} className="cursor-pointer rounded-md px-2 py-1.5 text-ink-secondary hover:bg-surface-sunken">
                  {c}
                </li>
              ))}
            </ul>
          }
          right={
            <div>
              <h4 className="text-sm font-semibold text-ink">Reliance Retail Ltd</h4>
              <p className="mt-1 text-sm text-ink-secondary">Customer detail renders here — the right pane of a Split View is a full Workspace section in production.</p>
            </div>
          }
        />
      </DemoSection>

      <DemoSection title="Widget & Widget Grid" deliverable="Deliverable 3.9" description="Every Homepage and Dashboard is composed exclusively from Widgets on a 12-column grid — drag to reorder, resize, or remove.">
        <WidgetGrid>
          <Widget title="On-Time Delivery" size="sm" onRemove={() => toast("info", "Widget removed")}>
            <StatCard label="This month" value="94.2%" trend="up" trendLabel="+2.1 pts" />
          </Widget>
          <Widget title="Order Volume by Region" size="md">
            <BarChart data={[{ label: "North", value: 42 }, { label: "West", value: 68 }, { label: "South", value: 35 }, { label: "East", value: 21 }]} />
          </Widget>
          <Widget title="AI Insight" size="lg" ai>
            <p className="text-sm text-ai">Demand for PVC-free vinyl is up 34% quarter-over-quarter, concentrated in IKEA project orders.</p>
          </Widget>
          <Widget title="Loading example" size="full" loading>
            <div />
          </Widget>
        </WidgetGrid>
      </DemoSection>
    </div>
  );
}
