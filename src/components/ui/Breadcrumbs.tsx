import { ChevronRight } from "lucide-react";

/**
 * Breadcrumbs — Deliverable 3.4 / Navigation System Deliverable 5
 * Purpose: show the user's location in the navigation hierarchy.
 * Behaviour: each segment is a click-through link except the current page.
 * Usage rule: present at the top of every Workspace/Detail/Document/Administration layout.
 */
export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-ink-secondary">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={item.label} className="flex items-center gap-1.5">
            {item.href && !isLast ? (
              <a href={item.href} className="hover:text-primary hover:underline">
                {item.label}
              </a>
            ) : (
              <span aria-current={isLast ? "page" : undefined} className={isLast ? "font-medium text-ink" : ""}>
                {item.label}
              </span>
            )}
            {!isLast && <ChevronRight size={14} className="text-ink-muted" />}
          </span>
        );
      })}
    </nav>
  );
}
