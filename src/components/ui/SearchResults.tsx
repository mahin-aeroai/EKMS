import { Sparkles } from "lucide-react";
import { SearchCard } from "./Card";

export interface SearchResultGroup {
  entityType: string;
  icon: React.ReactNode;
  results: { id: string; title: string; snippet: string; aiRationale?: string }[];
}

/**
 * Search Results — Deliverable 3.4
 * Purpose: full-page results view for Enterprise Search, grouped by entity type.
 * Behaviour: question-phrased queries surface an AI-generated direct answer above the
 * grouped results (Product Blueprint, Enterprise Search).
 */
export function SearchResults({
  query,
  aiAnswer,
  groups,
}: {
  query: string;
  aiAnswer?: string;
  groups: SearchResultGroup[];
}) {
  return (
    <div className="flex flex-col gap-6">
      {aiAnswer && (
        <div className="rounded-lg border border-ai/30 bg-ai-tint p-4">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ai">
            <Sparkles size={13} /> AI Answer
          </p>
          <p className="text-sm text-ink">{aiAnswer}</p>
        </div>
      )}
      {groups.map((g) => (
        <section key={g.entityType}>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">
              {g.entityType} <span className="font-normal text-ink-muted">({g.results.length})</span>
            </h3>
            <button className="text-xs font-medium text-primary hover:underline">See all</button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {g.results.map((r) => (
              <SearchCard
                key={r.id}
                icon={g.icon}
                entityType={g.entityType}
                title={r.title}
                snippet={
                  <>
                    {r.snippet.split(new RegExp(`(${query})`, "i")).map((part, i) =>
                      part.toLowerCase() === query.toLowerCase() ? (
                        <mark key={i} className="bg-warning-tint text-ink">
                          {part}
                        </mark>
                      ) : (
                        part
                      )
                    )}
                  </>
                }
                aiRationale={r.aiRationale}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
