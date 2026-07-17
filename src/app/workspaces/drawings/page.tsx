"use client";

import { useEffect, useState } from "react";
import { PenTool } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type DrawingRow } from "@/lib/supabase";

export default function DrawingsPage() {
  const { toast } = useToast();
  const [drawings, setDrawings] = useState<DrawingRow[] | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("drawings")
      .select("*")
      .then(({ data, error }) => {
        if (error) {
          toast("danger", "Couldn't load drawings from Supabase");
          return;
        }
        setDrawings(data ?? []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real file attached (relative_path set -- see
  // supabase-knowledge-files-migration.sql / upload-knowledge-files.mjs)
  // opens via a short-lived R2 signed URL, same pattern as Site Surveys.
  async function openFile(row: DrawingRow) {
    if (!row.relative_path) return;
    setOpeningId(row.id);
    try {
      const res = await fetch(`/api/knowledge-files/signed-url?table=drawings&path=${encodeURIComponent(row.relative_path)}`);
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.message ?? "Couldn't get a link to this file");
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch {
      toast("danger", "Couldn't open this drawing");
    } finally {
      setOpeningId(null);
    }
  }

  const COLUMNS: TableColumn<DrawingRow>[] = [
    { key: "number", header: "Drawing #", sortable: true },
    { key: "title", header: "Title", sortable: true },
    { key: "status", header: "Status", render: (r) => <Badge status={r.status}>{r.status_label}</Badge> },
    {
      key: "id",
      header: "",
      render: (r) =>
        r.relative_path ? (
          <Button
            variant="secondary"
            size="sm"
            loading={openingId === r.id}
            onClick={(e) => {
              e.stopPropagation();
              openFile(r);
            }}
          >
            View file
          </Button>
        ) : null,
    },
  ];

  const underRevision = drawings?.filter((d) => d.status === "warning").length ?? 0;

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Knowledge" }, { label: "Drawings" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <PenTool size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Drawings</h1>
              <Badge status="warning">{drawings ? `${underRevision} under revision` : "Loading…"}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Knowledge — engineering drawing register with live CAD preview</p>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Active Drawings" value={drawings === null ? "—" : String(drawings.length)} />
        <StatCard label="Under Revision" value={String(underRevision)} />
        <StatCard label="Approved This Month" value="—" />
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Drawing register</h3>
        {drawings === null ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading drawings…</p>
        ) : drawings.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No drawings loaded yet.</p>
        ) : (
          <Table columns={COLUMNS} rows={drawings} onRowClick={(r) => toast("info", `Opened ${r.number}`)} />
        )}
      </div>
    </div>
  );
}
