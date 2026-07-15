"use client";

import { useEffect, useState } from "react";
import { Lightbulb } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { StatCard, AICard, KnowledgeCard } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type LessonLearnedRow } from "@/lib/supabase";

export default function LessonsLearnedPage() {
  const { toast } = useToast();
  const [lessons, setLessons] = useState<LessonLearnedRow[] | null>(null);

  useEffect(() => {
    supabase
      .from("lessons_learned")
      .select("*")
      .then(({ data, error }) => {
        if (error) {
          toast("danger", "Couldn't load lessons learned from Supabase");
          return;
        }
        setLessons(data ?? []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Knowledge" }, { label: "Lessons Learned" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-warning-tint text-warning">
            <Lightbulb size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Lessons Learned</h1>
              <Badge status="info">312 total</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Knowledge — tacit knowledge captured from NCRs, projects, and daily operations</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag aiSuggested>Machine M-14&apos;s current alert matches a past lesson</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Lessons" value="312" trend="up" trendLabel="+9 this quarter" />
        <StatCard label="This Quarter" value="9" trend="up" trendLabel="+3 vs last quarter" />
        <StatCard label="Linked NCRs" value="146" trend="flat" trendLabel="No change" />
      </div>

      <div className="flex flex-col gap-6">
        <AICard
          variant="summary"
          title="This lesson matches Machine M-14's current alert"
          citation="NCR-2025-0442, vibration telemetry pattern"
          onAccept={() => toast("success", "Linked to Machine M-14 workspace")}
          onDismiss={() => toast("info", "Dismissed")}
        >
          The tie-bar bearing failure pattern from NCR-2025-0442 matches 84% of Machine M-14&apos;s current vibration signature — the lesson below is directly relevant to the active predictive alert.
        </AICard>
        {lessons === null ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading lessons…</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {lessons.map((l) => (
              <KnowledgeCard key={l.id} type={l.type} title={l.title} source={l.source ?? undefined}>
                {l.content}
              </KnowledgeCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
