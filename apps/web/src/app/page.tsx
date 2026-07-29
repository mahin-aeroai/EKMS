"use client";

import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { PromptInput } from "@/components/ui/PromptInput";
import { NAV } from "@/components/AppShell";

// "Home" itself is the first NAV section (a single tile pointing back to
// this page) -- no reason to render a tile that links to the page you're
// already on, so it's the one section skipped here.
const GROUPS = NAV.filter((section) => section.title !== "Home");

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
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Welcome to MMDI ONE</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Jump into any workspace below, or ask the AI Copilot anything about your business.
        </p>
      </div>

      <div className="mb-8 rounded-xl border border-ai/30 bg-ai-tint p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ai">
          <Sparkles size={16} /> Ask AI Copilot
        </div>
        <PromptInput onSubmit={handleAsk} />
      </div>

      {GROUPS.map((section) => (
        <div key={section.title} className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{section.title}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {section.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => router.push(item.href)}
                className="flex flex-col items-center gap-2 rounded-lg border border-line bg-surface p-4 text-center transition-shadow hover:shadow-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-tint text-primary">
                  {item.icon}
                </span>
                <span className="text-xs font-medium text-ink">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
