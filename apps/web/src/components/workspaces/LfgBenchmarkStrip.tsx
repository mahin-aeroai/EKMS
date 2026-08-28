import { Check } from "lucide-react";
import { lfgBenchmarkStatus } from "@/lib/lfgStatus";

// The six-checkpoint benchmark checklist (LFG_BENCHMARKS/lfgBenchmarkStatus
// in lfgStatus.ts -- see that file for the full reasoning), shared by
// every surface that displays a site: Status Sheet and Site Cards today.
// Discrete labeled chips, not a continuous bar (Site Cards' old tracking
// bar was explicitly removed per earlier feedback) -- a crossed checkpoint
// fills success-green with a check mark; one not yet reached stays a
// plain neutral outline.
export function LfgBenchmarkStrip({ status, creativeReceivedAt }: { status: string; creativeReceivedAt?: string | null }) {
  const benchmarks = lfgBenchmarkStatus(status, creativeReceivedAt);
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
