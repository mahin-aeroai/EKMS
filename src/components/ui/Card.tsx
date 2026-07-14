"use client";

import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, FileText, Minus, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "./Badge";
import { Tag } from "./Tag";

/**
 * Card (base) — Deliverable 3.2
 * Purpose: generic entity/content summary container. Every specialized card below
 * (Stat, AI, Entity, Search, Knowledge, Citation) is built from this one primitive —
 * no module is permitted to fork a bespoke card shell.
 */
export function Card({
  children,
  className,
  interactive = true,
  padding = "md",
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  padding?: "sm" | "md" | "lg";
}) {
  return (
    <div
      tabIndex={interactive ? 0 : undefined}
      className={cn(
        "rounded-lg border border-line bg-surface shadow-1 transition-shadow duration-[var(--dur-standard)]",
        interactive && "cursor-pointer hover:shadow-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        padding === "sm" && "p-3",
        padding === "md" && "p-4",
        padding === "lg" && "p-6",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Stat Card — Dashboard/Homepage KPI tile with trend, per Deliverable 3.2 & 9. */
export function StatCard({
  label,
  value,
  trend,
  trendLabel,
  aiInsight,
}: {
  label: string;
  value: string;
  trend?: "up" | "down" | "flat";
  trendLabel?: string;
  aiInsight?: string;
}) {
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const trendColor =
    trend === "up" ? "text-success" : trend === "down" ? "text-danger" : "text-ink-muted";
  return (
    <Card interactive={false} className="flex flex-col gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-secondary">{label}</span>
      <div className="flex items-end justify-between">
        <span className="text-2xl font-bold text-ink">{value}</span>
        {trend && (
          <span className={cn("flex items-center gap-0.5 text-xs font-semibold", trendColor)}>
            <TrendIcon size={14} />
            {trendLabel}
          </span>
        )}
      </div>
      {aiInsight && (
        <p className="mt-1 flex items-start gap-1.5 rounded-md bg-ai-tint px-2 py-1.5 text-xs text-ai">
          <Sparkles size={12} className="mt-0.5 shrink-0" />
          {aiInsight}
        </p>
      )}
    </Card>
  );
}

/** AI Card — Deliverable 3.2 & 7. AI-generated insight/recommendation/summary. */
export function AICard({
  variant = "insight",
  title,
  children,
  onAccept,
  onDismiss,
  citation,
}: {
  variant?: "insight" | "recommendation" | "summary";
  title: string;
  children: ReactNode;
  onAccept?: () => void;
  onDismiss?: () => void;
  citation?: string;
}) {
  return (
    <div className="rounded-lg border border-ai/30 bg-ai-tint p-4 shadow-1">
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ai">
        <Sparkles size={13} />
        <span className="sr-only">AI-generated:</span>
        {variant === "insight" ? "AI Insight" : variant === "recommendation" ? "AI Recommendation" : "AI Summary"}
      </div>
      <h4 className="mb-1 text-sm font-semibold text-ink">{title}</h4>
      <div className="text-sm text-ink-secondary">{children}</div>
      {citation && <CitationCard sources={[citation]} className="mt-3" />}
      {(onAccept || onDismiss) && (
        <div className="mt-3 flex gap-2">
          {onAccept && (
            <button
              onClick={onAccept}
              className="rounded-md bg-ai px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              Accept
            </button>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-surface-sunken"
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Entity Card — Deliverable 3.2. Summarizes a Customer/Material/Machine/Project/etc. record. */
export function EntityCard({
  icon,
  title,
  subtitle,
  status,
  statusLabel,
  chips = [],
  restricted = false,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  status?: "success" | "warning" | "danger" | "info" | "neutral";
  statusLabel?: string;
  chips?: string[];
  restricted?: boolean;
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-tint text-primary">
            {icon}
          </span>
          <div>
            <h4 className="text-sm font-semibold text-ink">{title}</h4>
            <p className="text-xs text-ink-secondary">{subtitle}</p>
          </div>
        </div>
        {status && statusLabel && <Badge status={status}>{statusLabel}</Badge>}
      </div>
      {restricted ? (
        <p className="text-xs italic text-ink-muted">Some fields are restricted for your role.</p>
      ) : (
        chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.slice(0, 4).map((c) => (
              <Tag key={c}>{c}</Tag>
            ))}
            {chips.length > 4 && <Tag>{`+${chips.length - 4} more`}</Tag>}
          </div>
        )
      )}
    </Card>
  );
}

/** Search Card — Deliverable 3.4. One Enterprise Search result. */
export function SearchCard({
  icon,
  entityType,
  title,
  snippet,
  aiRationale,
}: {
  icon: ReactNode;
  entityType: string;
  title: string;
  snippet: ReactNode;
  aiRationale?: string;
}) {
  return (
    <Card className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-xs font-medium text-ink-muted">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-surface-sunken text-ink-secondary">
          {icon}
        </span>
        {entityType}
      </div>
      <h4 className="text-sm font-semibold text-primary">{title}</h4>
      <p className="text-sm text-ink-secondary">{snippet}</p>
      {aiRationale && (
        <p className="flex items-center gap-1 text-xs italic text-ai">
          <Sparkles size={11} /> {aiRationale}
        </p>
      )}
    </Card>
  );
}

/** Knowledge Card — Deliverable 3.2. Lesson Learned / Engineering Note / FAQ. */
export function KnowledgeCard({
  type,
  title,
  children,
  source,
}: {
  type: "Lesson Learned" | "Engineering Note" | "FAQ";
  title: string;
  children: ReactNode;
  source?: string;
}) {
  return (
    <Card padding="md" className="flex flex-col gap-2">
      <Badge status={type === "FAQ" ? "info" : "neutral"}>{type}</Badge>
      <h4 className="text-sm font-semibold text-ink">{title}</h4>
      <p className="text-sm text-ink-secondary">{children}</p>
      {source && <p className="text-xs text-ink-muted">Source: {source}</p>}
    </Card>
  );
}

/** Citation Card — Deliverable 3.2 & 7. The trust mechanism behind every AI answer. */
export function CitationCard({ sources, className }: { sources: string[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {sources.map((s, i) => (
        <a
          key={s}
          href="#"
          className="inline-flex items-center gap-1 rounded-md border border-line-strong bg-surface px-2 py-1 text-xs text-ink-secondary hover:bg-surface-sunken"
        >
          <FileText size={11} />
          [{i + 1}] {s}
        </a>
      ))}
    </div>
  );
}

/** AI Feedback control — thumbs up/down, part of the AI Interaction Model (Deliverable 7). */
export function AIFeedback({ onFeedback }: { onFeedback?: (positive: boolean) => void }) {
  return (
    <div className="flex items-center gap-1 text-ink-muted">
      <button aria-label="Good response" onClick={() => onFeedback?.(true)} className="rounded p-1 hover:bg-surface-sunken hover:text-success">
        <ThumbsUp size={13} />
      </button>
      <button aria-label="Poor response" onClick={() => onFeedback?.(false)} className="rounded p-1 hover:bg-surface-sunken hover:text-danger">
        <ThumbsDown size={13} />
      </button>
    </div>
  );
}
