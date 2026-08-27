import type { ReactNode } from "react";

// Shared building blocks for the six /portal/policies/* pages (plus the
// index) -- pulls them out of the previous plain-paragraph-on-sunken-
// background look into something with actual visual weight: a colored
// icon badge + title per page (same badge pattern as the LFG Site 360
// header and other workspace pages), and each section as its own bordered
// card with a left-accent-bar heading instead of a bare <h2>.

export function PolicyHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="mb-6 flex items-start gap-4 border-b border-line pb-6">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
        {icon}
      </span>
      <div>
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        <span className="mt-1.5 inline-block rounded-full border border-line bg-surface-sunken px-2 py-0.5 text-xs text-ink-muted">
          Last updated: August 2026
        </span>
      </div>
    </div>
  );
}

export function PolicySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 rounded-lg border border-line bg-surface p-5 shadow-1">
      <h2 className="border-l-4 border-primary pl-3 text-sm font-semibold leading-tight text-ink">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-ink-secondary [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_em]:text-ink [&_em]:not-italic [&_em]:font-medium">
        {children}
      </div>
    </section>
  );
}
