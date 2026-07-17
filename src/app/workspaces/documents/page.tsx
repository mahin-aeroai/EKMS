"use client";

import { useEffect, useState } from "react";
import { FileStack } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { Button } from "@/components/ui/Button";
import { StatCard, AICard } from "@/components/ui/Card";
import { DocumentPreview } from "@/components/ui/Viewers";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type DocumentRow } from "@/lib/supabase";

// Fixed category taxonomy for the Documents module, per the user's request.
// A dropdown/chip list rather than free text, so filtering stays clean as
// the library grows -- extend this array (and re-deploy) whenever a new
// category is needed; it's not stored anywhere else as an enum, just here
// and whatever value gets written into documents.category at upload time.
// "Drawings" is deliberately included here as a plain category value (NOT a
// route into the separate Drawings/CAD workspace, which is a different
// table for actual engineering drawings) -- the user confirmed this is just
// a label for drawing-adjacent documents living in the Documents library.
export const DOCUMENT_CATEGORIES = [
  "IKEA IWAY",
  "FSC COC Audit",
  "ISO 9001",
  "Statutory Documents",
  "Drawings",
  "Other",
] as const;

const ALL = "All";

// Documents with a real file attached (relative_path set -- see
// supabase-knowledge-files-migration.sql / upload-knowledge-files.mjs) get a
// "View file" action that opens a short-lived R2 signed URL, same pattern as
// the Site Surveys workspace. Rows without a file (the original illustrative
// seed rows) just show the preview card as before.
export default function DocumentsPage() {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<DocumentRow[] | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL);

  useEffect(() => {
    supabase
      .from("documents")
      .select("*")
      .then(({ data, error }) => {
        if (error) {
          toast("danger", "Couldn't load documents from Supabase");
          return;
        }
        setDocuments(data ?? []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Two ways a document can have a real file: relative_path (copied into
  // R2 -- fetch a short-lived signed URL) or source_url (an external link,
  // e.g. Google Drive, for bulk-ingested files where copying bytes into R2
  // wasn't practical -- open it directly, Drive's own sharing permissions
  // already gate access).
  async function openFile(row: DocumentRow) {
    if (row.source_url) {
      window.open(row.source_url, "_blank", "noopener,noreferrer");
      return;
    }
    if (!row.relative_path) return;
    setOpeningId(row.id);
    try {
      const res = await fetch(`/api/knowledge-files/signed-url?table=documents&path=${encodeURIComponent(row.relative_path)}`);
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.message ?? "Couldn't get a link to this file");
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch {
      toast("danger", "Couldn't open this document");
    } finally {
      setOpeningId(null);
    }
  }

  const visibleDocuments = documents?.filter((d) => categoryFilter === ALL || d.category === categoryFilter) ?? null;
  const categoryChips = [ALL, ...DOCUMENT_CATEGORIES];

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
        <div className="flex flex-wrap gap-2">
          {categoryChips.map((c) => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                categoryFilter === c
                  ? "border-primary bg-primary text-on-brand"
                  : "border-line text-ink-secondary hover:bg-surface-sunken"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {documents === null ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading documents…</p>
        ) : visibleDocuments && visibleDocuments.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No documents in this category yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {visibleDocuments?.map((d) => (
              <div key={d.id} className="flex flex-col gap-2">
                <DocumentPreview title={d.title} summary={d.summary ?? ""} tags={d.tags} superseded={d.superseded} />
                <div className="flex flex-wrap items-center gap-2">
                  {d.category && <Badge status="neutral">{d.category}</Badge>}
                  {(d.relative_path || d.source_url) && (
                    <Button variant="secondary" size="sm" loading={openingId === d.id} onClick={() => openFile(d)}>
                      View file{d.file_size_bytes ? ` (${(d.file_size_bytes / 1024 / 1024).toFixed(1)} MB)` : ""}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
