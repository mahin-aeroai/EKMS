"use client";

import { useState } from "react";
import { PackageCheck } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { OrderBuilderTab } from "./OrderBuilderTab";
import { SuppliersTab } from "./SuppliersTab";
import { HistoryTab } from "./HistoryTab";
import { ToolAccessGuard } from "@/components/ToolAccessGuard";

// MMDI ONE Material Ordering -- new standalone Tools workspace, per the
// user's request: "I have this material ordering sheet based on program
// wise consumption with wastage ... Need a material ordering list to send
// for request. Create a page where I can mention the supplier and address
// and contact details, and make a list based on programs and material that
// I choose." Same page-shell + internal-tab-switcher pattern as Cost Sheet
// (see that workspace's page.tsx) -- one route, three tabs, rather than
// three separate nav entries.
//
// See supabase-material-ordering-schema.sql for the schema this reads/
// writes, and supabase-material-ordering-suppliers-seed.sql for the 12
// seeded suppliers / 16 supplier materials.
type TabId = "orderbuilder" | "suppliers" | "history";

const TABS: { id: TabId; label: string }[] = [
  { id: "orderbuilder", label: "Order Builder" },
  { id: "suppliers", label: "Suppliers & Materials" },
  { id: "history", label: "History" },
];

export default function MaterialOrderingPage() {
  const [activeTab, setActiveTab] = useState<TabId>("orderbuilder");

  return (
    <ToolAccessGuard toolId="material-ordering" toolLabel="Material Ordering">
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Tools" }, { label: "Material Ordering" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <PackageCheck size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Material Ordering</h1>
              <Badge status="info">Live from Supabase</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">
              Tools — pick a supplier and the production programs to include, and get a computed roll/sheet/pack order list
              (wastage already factored into consumption) ready to send
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag>Program-wise consumption</Tag>
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

      {activeTab === "orderbuilder" && <OrderBuilderTab />}
      {activeTab === "suppliers" && <SuppliersTab />}
      {activeTab === "history" && <HistoryTab />}
    </div>
    </ToolAccessGuard>
  );
}
