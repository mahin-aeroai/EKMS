"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
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
      {/* Hero banner -- brand gradient sampled from the MMDI logo (red at
          top-left through orange to gold at bottom-right), styled like a
          classic Apple hero: one confident headline, huge negative space,
          minimal supporting copy. The dark scrim on top guarantees the
          white text stays legible over every part of the gradient,
          including the paler gold corner. */}
      <div
        className="relative mb-8 overflow-hidden rounded-2xl px-8 py-14 text-center sm:px-12 sm:py-20"
        style={{ background: "linear-gradient(135deg, #FB050D 0%, #F97A2A 55%, #FBCB3F 100%)" }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0) 40%, rgba(0,0,0,0.18) 100%)" }}
        />
        {/* Soft glow, an understated nod to Apple's glossy hero backdrops. */}
        <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-white/20 blur-3xl" />

        <div className="relative mx-auto max-w-2xl">
          <Image
            src="/brand/mmdi-logo.jpg"
            alt="MMDI"
            width={64}
            height={64}
            className="mx-auto mb-6 rounded-xl shadow-lg"
            priority
          />
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/80">MMDI ONE</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">Bringing Brands Alive.</h1>
          <p className="mx-auto mt-4 max-w-lg text-base text-white/90 sm:text-lg">
            Signage, graphics, displays &amp; decor — run end to end from one enterprise operating platform.
          </p>
        </div>
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
