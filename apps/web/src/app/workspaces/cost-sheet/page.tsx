"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { CostSheetCalcTab } from "./CostSheetCalcTab";
import { BomMasterTab } from "./BomMasterTab";
import { RateCardTab } from "./RateCardTab";
import { MaterialPricingTab } from "./MaterialPricingTab";
import { ToolAccessGuard } from "@/components/ToolAccessGuard";

// MMDI ONE Cost Sheet -- new standalone Tools workspace (per the scoping
// questions PROJECT_STATUS.md's "Next up" section raised, and the user's
// answers: new top-level module, wired to real Supabase data, BOM + Work
// Centre cost model -- not an extension of Sign Estimator's CostSheetTab or
// the Costing dashboard). One route with an internal tab switcher, same
// structure as Sign Estimator (see that workspace's page.tsx) since this is
// also a multi-tab "app on one screen" rather than 3 separate nav entries.
//
// See supabase-cost-sheet-schema.sql for the schema this reads/writes, and
// PROJECT_STATUS.md for the full scoping history.
type TabId = "costsheet" | "bommaster" | "ratecard" | "materialpricing";

const TABS: { id: TabId; label: string }[] = [
  { id: "costsheet", label: "Cost Sheet" },
  { id: "bommaster", label: "BOM Master" },
  { id: "ratecard", label: "Rate Card" },
  { id: "materialpricing", label: "Material Pricing" },
];

export default function CostSheetPage() {
  const [activeTab, setActiveTab] = useState<TabId>("costsheet");

  return (
    <ToolAccessGuard toolId="cost-sheet" toolLabel="Cost Sheet">
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Tools" }, { label: "Cost Sheet" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <Calculator size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Cost Sheet</h1>
              <Badge status="info">Live from Supabase</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">
              Tools — finished-goods costing across all 33 BOM templates: material cost (recent + average purchase price) plus
              work-centre process cost, per FG code
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag>BOM + Work Centre model</Tag>
              <Tag aiSuggested>Ported from this session&apos;s Excel workbook</Tag>
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

      {activeTab === "costsheet" && <CostSheetCalcTab />}
      {activeTab === "bommaster" && <BomMasterTab />}
      {activeTab === "ratecard" && <RateCardTab />}
      {activeTab === "materialpricing" && <MaterialPricingTab />}
    </div>
    </ToolAccessGuard>
  );
}
