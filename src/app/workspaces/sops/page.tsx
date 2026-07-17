"use client";

import { useEffect, useState } from "react";
import { ListChecks } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { Button } from "@/components/ui/Button";
import { StatCard, AICard } from "@/components/ui/Card";
import { DocumentPreview } from "@/components/ui/Viewers";
import { Timeline } from "@/components/ui/Timeline";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type SopRow } from "@/lib/supabase";

export default function SOPsPage() {
  const { toast } = useToast();
  const [sops, setSops] = useState<SopRow[] | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("sops")
      .select("*")
      .then(({ data, error }) => {
        if (error) {
          toast("danger", "Couldn't load SOPs from Supabase");
          return;
        }
        setSops(data ?? []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openFile(row: SopRow) {
    if (!row.relative_path) return;
    setOpeningId(row.id);
    try {
      const res = await fetch(`/api/knowledge-files/signed-url?table=sops&path=${encodeURIComponent(row.relative_path)}`);
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.message ?? "Couldn't get a link to this file");
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch {
      toast("danger", "Couldn't open this SOP");
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Knowledge" }, { label: "SOPs" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <ListChecks size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">SOPs</h1>
              <Badge status="warning">2 overdue for review</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Knowledge — standard operating procedures across all manufacturing processes</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag aiSuggested>SOP-0044 due for its annual review</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Active SOPs" value="94" trend="flat" trendLabel="No change" />
        <StatCard label="Under Review" value="3" trend="up" trendLabel="+1 this month" />
        <StatCard label="Overdue for Review" value="2" trend="up" trendLabel="+2 this quarter" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <AICard
            variant="recommendation"
            title="Schedule SOP-0044's annual review"
            citation="SOP Master, review cadence policy"
            onAccept={() => toast("success", "Review scheduled")}
            onDismiss={() => toast("info", "Dismissed")}
          >
            This SOP is 14 days past its annual review date — it&apos;s referenced by every injection molding machine setup, so a lapse here has wide downstream impact.
          </AICard>
          {sops === null ? (
            <p className="py-6 text-center text-sm text-ink-muted">Loading SOPs…</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {sops.map((s) => (
                <div key={s.id} className="flex flex-col gap-2">
                  <DocumentPreview title={s.title} summary={s.summary ?? ""} tags={s.tags} />
                  {s.relative_path && (
                    <Button variant="secondary" size="sm" loading={openingId === s.id} onClick={() => openFile(s)}>
                      View file{s.file_size_bytes ? ` (${(s.file_size_bytes / 1024 / 1024).toFixed(1)} MB)` : ""}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Revision history — SOP-0044</h3>
          <Timeline entries={[
            { id: "t1", date: "14 Apr 2025", title: "Rev 4 published", description: "Added tie-bar inspection step." },
            { id: "t2", date: "2 Nov 2024", title: "Rev 3 published" },
            { id: "t3", date: "18 Mar 2023", title: "Original SOP published" },
          ]} />
        </div>
      </div>
    </div>
  );
}
