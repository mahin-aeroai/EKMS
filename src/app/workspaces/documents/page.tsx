"use client";

import { FileStack } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { StatCard, AICard } from "@/components/ui/Card";
import { DocumentPreview } from "@/components/ui/Viewers";
import { useToast } from "@/components/ui/Notifications";

export default function DocumentsPage() {
  const { toast } = useToast();

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Knowledge" }, { label: "Documents" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <FileStack size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Documents</h1>
              <Badge status="info">2 pending review</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Knowledge — governed document library across all modules</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag aiSuggested>Quality Manual v3 has an unreviewed successor</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Documents" value="1,842" trend="up" trendLabel="+34 this month" />
        <StatCard label="Pending Review" value="2" trend="flat" trendLabel="No change" />
        <StatCard label="Superseded" value="126" trend="up" trendLabel="+6 this month" />
      </div>

      <div className="flex flex-col gap-6">
        <AICard
          variant="insight"
          title="Quality Manual v4 awaiting approval"
          citation="Document Master, version control log"
          onAccept={() => toast("success", "Reminder sent to reviewer")}
          onDismiss={() => toast("info", "Dismissed")}
        >
          v4 has been in review for 8 days — longer than the typical 3-day review cycle for Tier 1 documents.
        </AICard>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DocumentPreview title="Quality Manual v4" summary="Pending approval — tolerance section updated per the latest SOP revision." tags={["Quality", "Under Review"]} />
          <DocumentPreview title="Master Service Agreement — Reliance Retail" summary="Governs all supply terms, pricing tiers, and Net 45 payment terms." tags={["Contract", "Rev 2"]} />
          <DocumentPreview title="SOP-0044 — Injection Molding Setup" summary="Standard operating procedure for machine setup prior to a production run." tags={["SOP", "Rev 4"]} />
          <DocumentPreview title="Quality Manual v3" summary="Superseded by v4, pending approval." tags={["Quality"]} superseded />
        </div>
      </div>
    </div>
  );
}
