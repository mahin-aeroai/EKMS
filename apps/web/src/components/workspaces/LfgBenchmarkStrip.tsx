import { Check } from "lucide-react";
import { lfgBenchmarkStatus } from "@/lib/lfgStatus";

// The six-checkpoint benchmark checklist (LFG_BENCHMARKS/lfgBenchmarkStatus
// in lfgStatus.ts -- see that file for the full reasoning), shared by
// every surface that displays a site: Status Sheet and Site Cards today.
// Discrete labeled chips, not a continuous bar (Site Cards' old tracking
// bar was explicitly removed per earlier feedback) -- a crossed checkpoint
// fills success-green with a check mark; one not yet reached stays a
// plain neutral outline.
//
// `printed`/`installed` (19-22 Sept 2026 fix, Mahin: "Installed not
// installed filters not workign still") -- optional overrides for the
// "Printed"/"Installed" checkpoints. Without them this strip is purely
// site_status-rank-derived (see lfgStatus.ts's own big comment on why:
// cheap, no per-site query), which is a coarse approximation that can
// disagree with the real lfg_production/lfg_installations signal the
// Printed/Installed FILTERS use (computeSiteFacets) -- a site whose status
// has advanced far enough in rank shows "crossed" here even if its actual
// production/installation row was never marked completed, which is
// exactly what made a card look "Installed" while the "Not installed"
// filter (correctly, per the real signal) still matched it. Callers that
// already have the real signal in hand -- both Site Master pages compute
// printedIds/installedIds Sets for their own filters -- pass it straight
// through here too, so the same real data drives what's filtered AND what
// the card shows, instead of two different definitions of "Installed"
// disagreeing on-screen. Callers that don't have it (Status Sheet) omit
// these and keep the previous rank-based behavior, unchanged.
export function LfgBenchmarkStrip({
  status,
  creativeReceivedAt,
  printed,
  installed,
}: {
  status: string;
  creativeReceivedAt?: string | null;
  printed?: boolean;
  installed?: boolean;
}) {
  const benchmarks = lfgBenchmarkStatus(status, creativeReceivedAt).map((b) => {
    if (b.key === "in_production" && printed !== undefined) return { ...b, crossed: printed };
    if (b.key === "installed" && installed !== undefined) return { ...b, crossed: installed };
    return b;
  });
  return (
    <div className="flex flex-wrap gap-1">
      {benchmarks.map((b) => (
        <span
          key={b.key}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${
            b.crossed ? "border-success/30 bg-success-tint text-success" : "border-line text-ink-muted"
          }`}
        >
          {b.crossed && <Check size={10} className="shrink-0" />}
          {b.label}
        </span>
      ))}
    </div>
  );
}
