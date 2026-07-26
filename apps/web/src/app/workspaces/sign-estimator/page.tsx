"use client";

import { useState } from "react";
import { Ruler } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { EstimatorTab } from "./EstimatorTab";
import { MastersTab } from "./MastersTab";
import { CostSheetTab } from "./CostSheetTab";
import { DashboardTab } from "./DashboardTab";
import { HistoryTab } from "./HistoryTab";

// MMDI ONE Sign Estimator -- React rewrite of the user's standalone
// SignERP_v2.html tool, migrated to real Supabase tables (see
// supabase-sign-estimator-schema.sql). Deliberately built as ONE route with
// an internal tab switcher (not 5 separate top-nav entries), matching the
// user's explicit "one single screen if possible" request -- this mirrors
// the original tool's own single-file, single-page structure.
//
// The tab switcher below is hand-rolled (not the shared <Tabs> component)
// because it needs to be controllable from the outside: generating a cost
// sheet in the Estimator tab, or clicking a row in Dashboard/History, jumps
// the user straight to the Cost Sheet tab for that specific estimate. The
// shared Tabs component only manages its own internal state, which can't be
// driven externally. <Tabs> is still used one level down, inside Masters,
// for its 7 sub-tabs -- that switching genuinely is self-contained.
type TabId = "estimator" | "masters" | "costsheet" | "dashboard" | "history";

const TABS: { id: TabId; label: string }[] = [
  { id: "estimator", label: "Estimator" },
  { id: "masters", label: "Masters" },
  { id: "costsheet", label: "Cost Sheet" },
  { id: "dashboard", label: "Dashboard" },
  { id: "history", label: "History" },
];

export default function SignEstimatorPage() {
  const [activeTab, setActiveTab] = useState<TabId>("estimator");
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  function openEstimate(ref: string) {
    setSelectedRef(ref);
    setActiveTab("costsheet");
  }

  function onEstimateSaved() {
    setRefreshKey((k) => k + 1);
    setSelectedRef(null); // null = "most recent", picked up by CostSheetTab
    setActiveTab("costsheet");
  }

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Customers" }, { label: "Sign Estimator" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <Ruler size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Sign Estimator</h1>
              <Badge status="info">Live from Supabase</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">
              Customers — soft-signage cost estimation: bin-packed profile costing, area-based sheet costing, LED module/bar
              layout, driver selection, and GST-ready pricing
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag>Rebuilt from SignERP_v2.html</Tag>
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

      <div>
        {activeTab === "estimator" && <EstimatorTab onSaved={onEstimateSaved} />}
        {activeTab === "masters" && <MastersTab onChanged={() => setRefreshKey((k) => k + 1)} />}
        {activeTab === "costsheet" && <CostSheetTab estimateRef={selectedRef} />}
        {activeTab === "dashboard" && <DashboardTab refreshKey={refreshKey} onOpenEstimate={openEstimate} />}
        {activeTab === "history" && <HistoryTab refreshKey={refreshKey} onOpenEstimate={openEstimate} />}
      </div>
    </div>
  );
}
