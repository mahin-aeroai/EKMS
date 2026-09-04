"use client";

import Link from "next/link";
import { Database, Building2, Handshake, UserRound, Wrench } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { MastersTab } from "./MastersTab";

// "Masters" hub (2 Sept 2026 -- Srinivas: "Lets create masters — collect
// masters of all pages and put them in one place... Company master,
// Branch master, Sales office master, Employee master, Machinery master,
// Sales person master, Product master, customer master, supplier
// master... let them have togather in one place").
//
// Two halves, deliberately not one flat list:
//  1. "Manage here" — Company / Branch / Sales Office / Sales Person /
//     Product. These had no home anywhere in the app before this page
//     (see supabase-masters-schema.sql), so they're built directly into
//     this workspace via the generic MasterPanel/MasterConfig pattern
//     (masterConfig.ts) -- the same config-driven approach Sign
//     Estimator's own Masters tab already uses for its 7 material types.
//  2. "Elsewhere in MMDI ONE" — Customer, Supplier, Employee, Machinery.
//     These already have their own full workspaces with real data,
//     history, and workflow beyond plain CRUD (Customer Workspace's
//     account/contract view, Suppliers' scorecards, People's org chart,
//     Machines' OEE/maintenance tracking) -- rebuilding them as a 6th/
//     7th/8th/9th generic panel here would be a strictly worse,
//     duplicate copy. This section is link-out cards to those existing
//     pages instead, so "all masters in one place" means one page you
//     can always find every master FROM, not one page that owns every
//     master's data.
const LINKED_MASTERS = [
  { label: "Customer Master", description: "Customer Workspace — accounts, contracts, order history", href: "/workspaces/customer", icon: Building2 },
  { label: "Supplier Master", description: "Suppliers — scorecards, on-time performance", href: "/workspaces/suppliers", icon: Handshake },
  { label: "Employee Master", description: "People — org chart, roles, departments", href: "/workspaces/people", icon: UserRound },
  { label: "Machinery Master", description: "Machines — OEE, uptime, maintenance", href: "/workspaces/machine", icon: Wrench },
];

export default function MastersPage() {
  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Masters" }]} />

      <div className="mt-4 flex items-start gap-4 border-b border-line pb-6">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
          <Database size={22} />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-ink">Masters</h1>
          <p className="mt-0.5 text-sm text-ink-secondary">
            Every master-data list in one place — manage Company, Branch, Sales Office, Sales Person, and Product
            here; Customer, Supplier, Employee, and Machinery link out to their own workspaces below.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <MastersTab />
      </div>

      <div className="mt-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">Elsewhere in MMDI ONE</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LINKED_MASTERS.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4 transition-shadow hover:shadow-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-tint text-primary">
                <m.icon size={18} />
              </span>
              <span className="text-sm font-medium text-ink">{m.label}</span>
              <span className="text-xs text-ink-secondary">{m.description}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
