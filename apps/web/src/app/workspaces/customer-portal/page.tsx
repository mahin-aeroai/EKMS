"use client";

import { useState } from "react";
import { Store } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { CompaniesTab } from "./CompaniesTab";
import { ProductsTab } from "./ProductsTab";
import { OrdersTab } from "./OrdersTab";

// Staff-side management for the customer portal (/portal/*) — the
// invite-only ordering site for Apple-format retail chains (GPX04/GPX05
// signage). See supabase-customer-portal-schema.sql's header comment for
// the full design, and PROJECT_STATUS.md for the build history.
//
// Order review/proof-upload/status-transition itself deliberately lives on
// the SAME /portal/orders/[orderId] page a customer sees, not duplicated
// here — OrderDetailClient already renders the staff-only controls when
// the signed-in user is admin/editor (see its `isStaff` prop), so the
// Orders tab below just links straight into that page.
type TabId = "companies" | "products" | "orders";

const TABS: { id: TabId; label: string }[] = [
  { id: "companies", label: "Companies & Stores" },
  { id: "products", label: "Products" },
  { id: "orders", label: "Orders" },
];

export default function CustomerPortalWorkspacePage() {
  const [activeTab, setActiveTab] = useState<TabId>("companies");

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Customers" }, { label: "Customer Portal" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <Store size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Customer Portal</h1>
              <Badge status="info">Invite-only</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">
              Manage retail-chain accounts, stores, the GPX04/GPX05 catalog, and every order placed through
              app.mmdi.in/portal.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag>Razorpay checkout</Tag>
              <Tag aiSuggested>Files never sit on this server — Cloudflare R2 direct upload/download</Tag>
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

      {activeTab === "companies" && <CompaniesTab />}
      {activeTab === "products" && <ProductsTab />}
      {activeTab === "orders" && <OrdersTab />}
    </div>
  );
}
