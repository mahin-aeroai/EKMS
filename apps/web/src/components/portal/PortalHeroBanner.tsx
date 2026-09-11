"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Clock, Leaf, Users } from "lucide-react";

const TRUST_BADGES = [
  { icon: ShieldCheck, label: "Trusted Quality" },
  { icon: Clock, label: "Reliable Fulfilment" },
  { icon: Leaf, label: "Sustainable Solutions" },
  { icon: Users, label: "End-to-End Support" },
];

// Where to drop the real photo when it's ready (task feedback: "i will
// give nice image to insert") -- save it at this exact path
// (public/brand/portal-hero.jpg) and it swaps in automatically, no code
// change needed. Until then, onError below falls back to the coded
// gradient panel rather than showing a broken-image icon.
const HERO_IMAGE_SRC = "/brand/portal-hero.jpg";

/**
 * Signed-in customer portal home page hero -- coded from the reference
 * banner (task feedback: "make beautiful page instead a jpeg upload"),
 * not a static image. Every color here is one of globals.css's existing
 * semantic tokens (primary/ai/success) -- no new brand hex introduced --
 * per this app's "components must reference semantic tokens only" rule.
 */
export function PortalHeroBanner({
  greetingName,
  ctaHref,
}: {
  greetingName: string;
  ctaHref: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-surface shadow-2">
      <div className="grid grid-cols-1 gap-8 p-6 sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-10 lg:p-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Welcome back, {greetingName}</p>
          <h1 className="mt-2 text-3xl font-bold leading-[1.1] tracking-tight text-ink sm:text-4xl">
            Print Beyond
            <br />
            <span className="bg-gradient-to-r from-primary via-ai to-success bg-clip-text text-transparent">
              Possibilities.
            </span>
          </h1>
          <p className="mt-3 max-w-md text-sm text-ink-secondary sm:text-base">
            From ideas to impact — place a new order, track design approval, and follow every shipment right through to your stores.
          </p>

          <Link
            href={ctaHref}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-brand shadow-1 transition-colors hover:bg-primary-hover"
          >
            Place Your Order
            <ArrowRight size={16} />
          </Link>

          <div className="mt-7 grid grid-cols-2 gap-x-4 gap-y-3 sm:flex sm:flex-wrap sm:gap-6">
            {TRUST_BADGES.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2">
                <Icon size={16} className="shrink-0 text-primary" />
                <span className="text-xs font-medium text-ink-secondary sm:text-sm">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg shadow-1">
          {!imgFailed ? (
            // eslint-disable-next-line @next/next/no-img-element -- small static local asset, next/image isn't used anywhere else in this app; onError needs a plain <img>
            <img
              src={HERO_IMAGE_SRC}
              alt="MMDI printed work — signage, vehicle graphics, and environments"
              className="h-full w-full object-cover"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="relative h-full w-full bg-gradient-to-br from-primary-tint via-ai-tint to-success-tint">
              <div className="absolute -left-6 -top-10 h-40 w-40 rounded-full bg-primary/25 blur-3xl" aria-hidden="true" />
              <div className="absolute right-0 top-1/4 h-36 w-36 rounded-full bg-ai/25 blur-3xl" aria-hidden="true" />
              <div className="absolute bottom-0 left-1/4 h-44 w-44 rounded-full bg-success/25 blur-3xl" aria-hidden="true" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
                <span className="text-4xl font-bold tracking-tight text-ink/15 sm:text-5xl">MMDI</span>
                <p className="max-w-[220px] text-sm font-medium text-ink-secondary">Signage · Vehicles · Displays · Environments</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="h-1.5 w-full bg-gradient-to-r from-primary via-ai to-success" aria-hidden="true" />
    </div>
  );
}
