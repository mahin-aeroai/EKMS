"use client";

import { cloneElement, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Sparkles } from "lucide-react";
import { PromptInput } from "@/components/ui/PromptInput";
import { NAV } from "@/components/AppShell";

// "Home" itself is the first NAV section (a single tile pointing back to
// this page) -- no reason to render a tile that links to the page you're
// already on, so it's the one section skipped here.
const GROUPS = NAV.filter((section) => section.title !== "Home");

// One consistent icon-tile color per section, cycling through 6 dedicated
// "category" tokens (globals.css, all 3 themes) -- deliberately NOT the
// red/green/blue semantic role colors (success/warning/danger/info) used
// elsewhere for actual status, so groups here read as classic and
// muted rather than like traffic-light status chips. Solid fill +
// on-brand (white) icon, like an app-icon glyph. Literal class strings on
// purpose: Tailwind only generates classes it can see written out in
// source, not ones assembled via `${}` template interpolation.
const TILE_COLORS = [
  "bg-cat-navy text-on-brand",
  "bg-cat-bronze text-on-brand",
  "bg-cat-teal text-on-brand",
  "bg-cat-plum text-on-brand",
  "bg-cat-olive text-on-brand",
  "bg-cat-slate text-on-brand",
];

// Each section also sits in its own pale-tint background block (same color
// family as its tiles' icons) so the groups themselves are visually
// separated at a glance, not just distinguishable icon-by-icon.
const BLOCK_STYLES = [
  { block: "bg-cat-navy-tint", heading: "text-cat-navy" },
  { block: "bg-cat-bronze-tint", heading: "text-cat-bronze" },
  { block: "bg-cat-teal-tint", heading: "text-cat-teal" },
  { block: "bg-cat-plum-tint", heading: "text-cat-plum" },
  { block: "bg-cat-olive-tint", heading: "text-cat-olive" },
  { block: "bg-cat-slate-tint", heading: "text-cat-slate" },
];

export default function HomePage() {
  const router = useRouter();

  function handleAsk(message: string) {
    // Full conversation UI (citations, contact picker, live Supabase stat
    // row) lives on the AI Copilot workspace page -- this box is a fast
    // entry point into it, not a second implementation of it. The AI
    // Copilot page picks the `q` param up on mount and auto-sends it.
    router.push(`/workspaces/ai-copilot?q=${encodeURIComponent(message)}`);
  }

  return (
    <div>
      {/* Small classic masthead -- logo + wordmark, left-to-right, black on
          white, no restated tagline (the logo already carries the brand).
          The gradient accent bar and soft corner glow -- both sampled from
          the logo's orange/gold, no red -- are what keep it from reading as
          a plain empty box while staying small and restrained. */}
      <div className="relative mb-8 flex items-center gap-4 overflow-hidden rounded-xl border border-line bg-surface py-4 pl-6 pr-5">
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-1.5"
          style={{ background: "linear-gradient(to bottom, #F97A2A, #FBCB4A)" }}
        />
        <div
          className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, #FBCB4A, transparent 70%)" }}
        />
        <Image
          src="/brand/mmdi-logo.jpg"
          alt="MMDI"
          width={48}
          height={48}
          className="relative rounded-lg shadow-2"
          priority
        />
        <div className="relative">
          <p className="text-lg font-bold tracking-tight text-ink">MMDI ONE</p>
          <p className="text-xs text-ink-secondary">Enterprise operating platform</p>
        </div>
      </div>

      <div className="mb-8 rounded-xl border border-ai/30 bg-ai-tint p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ai">
          <Sparkles size={16} /> Ask AI Copilot
        </div>
        <PromptInput onSubmit={handleAsk} />
      </div>

      {GROUPS.map((section, sectionIndex) => {
        const color = TILE_COLORS[sectionIndex % TILE_COLORS.length];
        const { block, heading } = BLOCK_STYLES[sectionIndex % BLOCK_STYLES.length];
        return (
          <div key={section.title} className={`mb-6 rounded-2xl p-5 ${block}`}>
            <h2 className={`mb-3 text-xs font-bold uppercase tracking-wide ${heading}`}>{section.title}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {section.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => router.push(item.href)}
                  className="group flex flex-col items-center gap-2.5 rounded-xl border border-line bg-surface p-4 text-center shadow-1 transition-shadow hover:shadow-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-1 transition-transform group-hover:scale-105 ${color}`}
                  >
                    {cloneElement(item.icon as ReactElement<{ size?: number }>, { size: 24 })}
                  </span>
                  <span className="text-xs font-medium text-ink">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
