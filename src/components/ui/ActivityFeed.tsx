import { cn } from "@/lib/cn";

export interface ActivityItem {
  id: string;
  actor: string;
  action: string;
  target: string;
  time: string;
  aiRanked?: boolean;
}

/**
 * Activity Feed — Deliverable 3.3
 * Purpose: cross-record recent-activity stream, used on the Homepage.
 * Behaviour: filters to what's relevant to the viewing user's role/recent context.
 * AI Integration: can be reordered by AI-estimated relevance rather than strict recency.
 */
export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-muted">All caught up.</p>;
  }
  return (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <li key={item.id} className="flex items-start justify-between gap-3 py-3">
          <p className="text-sm text-ink">
            <span className="font-semibold">{item.actor}</span> {item.action}{" "}
            <span className="font-medium text-primary">{item.target}</span>
          </p>
          <span className={cn("shrink-0 text-xs text-ink-muted", item.aiRanked && "text-ai")}>
            {item.time}
          </span>
        </li>
      ))}
    </ul>
  );
}
