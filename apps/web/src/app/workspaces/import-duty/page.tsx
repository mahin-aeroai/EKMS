"use client";

import { useState } from "react";
import { Ship } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { CalculatorTab } from "./CalculatorTab";
import { HistoryTab } from "./HistoryTab";
import { ToolAccessGuard } from "@/components/ToolAccessGuard";

// MMDI ONE Import Duty / Landing Cost Calculator -- new standalone Tools
// workspace, per the user's request to port "Import Duty calculation.xlsx"
// (a per-shipment landed-cost worksheet) into an editable tool where every
// duty-rate percentage (BCD/SW Cess/IGST) is a per-line input rather than
// baked into one static sheet, since real shipments mix HS codes with
// different rates. Same page-shell + internal-tab-switcher pattern as
// Material Ordering (see that workspace's page.tsx) -- one route, two
// tabs, rather than two separate nav entries.
//
// See supabase-import-duty-schema.sql for the schema this reads/writes and
// the exact per-line formula (mirrored live in CalculatorTab.tsx).
type TabId = "calculator" | "history";

const TABS: { id: TabId; label: string }[] = [
  { id: "calculator", label: "Calculator" },
  { id: "history", label: "History" },
];

export default function ImportDutyPage() {
  const [activeTab, setActiveTab] = useState<TabId>("calculator");

  return (
    <ToolAccessGuard toolId="import-duty" toolLabel="Import Duty">
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Tools" }, { label: "Import Duty" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <Ship size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Import Duty & Landing Cost</h1>
              <Badge status="info">Live from Supabase</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">
              Tools — compute landed cost per shipment: invoice value, customs duty (BCD/SW Cess/IGST), freight and clearing
              charges, down to cost per unit
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag>Per-line duty rates</Tag>
              <Tag aiSuggested>Editable before save</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === t.id ? "border-primary text-primary" : "border-transparent text-ink-secondary hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "calculator" && <CalculatorTab />}
      {activeTab === "history" && <HistoryTab />}
    </div>
    </ToolAccessGuard>
  );
}
