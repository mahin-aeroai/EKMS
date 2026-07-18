"use client";

import Link from "next/link";
import { ArrowLeft, Database } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { MastersTab } from "@/components/installationReport/MastersTab";

/**
 * Manage Master Data — Store Master, Creative Master, and the reusable
 * Fixture Type / Material / Sign Type / Installation Team catalogs used by
 * the Installation Report tool's pickers. Deliberately not in the main
 * sidebar (same reasoning as /account) — it's reached via a "Manage Master
 * Data" link from the Installation Report tool itself, since it's config
 * for that one tool rather than a standalone workspace.
 */
export default function InstallationReportMasterDataPage() {
  return (
    <div>
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Installation Report", href: "/workspaces/installation-report" },
          { label: "Manage Master Data" },
        ]}
      />

      <div className="mt-4 flex items-start gap-4 border-b border-line pb-6">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
          <Database size={22} />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-ink">Installation Report — Master Data</h1>
          <p className="mt-0.5 text-sm text-ink-secondary">
            Store details, creatives, and reusable pick-lists — set these up once and every report pulls from here
            instead of retyping.
          </p>
        </div>
        <Link
          href="/workspaces/installation-report"
          className="ml-auto flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft size={14} /> Back to report
        </Link>
      </div>

      <div className="mt-6">
        <MastersTab />
      </div>
    </div>
  );
}
