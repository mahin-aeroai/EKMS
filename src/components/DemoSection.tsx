import type { ReactNode } from "react";

/** Shared page-header used at the top of every showcase route. */
export function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-8 border-b border-line pb-6">
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      <p className="mt-1.5 max-w-2xl text-sm text-ink-secondary">{description}</p>
    </div>
  );
}

/** Shared wrapper for one live component demo within a showcase page. */
export function DemoSection({
  title,
  deliverable,
  description,
  children,
}: {
  title: string;
  deliverable?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {deliverable && (
          <span className="shrink-0 rounded-full bg-surface-sunken px-2.5 py-0.5 text-[11px] font-medium text-ink-muted">
            {deliverable}
          </span>
        )}
      </div>
      {description && <p className="mb-4 text-sm text-ink-secondary">{description}</p>}
      <div className="rounded-lg border border-line bg-surface p-6">{children}</div>
    </section>
  );
}
