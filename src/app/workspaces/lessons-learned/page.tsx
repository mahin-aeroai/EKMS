"use client";

import { useEffect, useState } from "react";
import { Lightbulb } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { StatCard, KnowledgeCard } from "@/components/ui/Card";
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
              {lessons && <Badge status="info">{lessons.length} total</Badge>}
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Knowledge — tacit knowledge captured from NCRs, projects, and daily operations</p>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Lessons" value={lessons === null ? "—" : String(lessons.length)} />
        <StatCard label="This Quarter" value="—" />
        <StatCard label="Linked NCRs" value="—" />
      </div>

      <div className="flex flex-col gap-6">
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
