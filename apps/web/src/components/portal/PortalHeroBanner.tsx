"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Clock, Leaf, Users, Building2, Car, Signpost, Monitor, Palette, ImageOff } from "lucide-react";
import { PORTAL_HERO_SLOTS, type PortalHeroSlotKey } from "@/lib/portalHeroSlots";

const TRUST_BADGES = [
  { icon: ShieldCheck, label: "Trusted Quality" },
  { icon: Clock, label: "Reliable Fulfilment" },
  { icon: Leaf, label: "Sustainable Solutions" },
  { icon: Users, label: "End-to-End Support" },
];

// Icon + gradient-token pair shown in a slot's placeholder tile before any
// photo has been uploaded for it (Customer Portal workspace → Hero Banner
// tab uploads the real thing) -- every color is one of globals.css's
// existing semantic tokens, no new brand hex, same rule as the rest of
// this component.
const SLOT_PLACEHOLDER: Record<PortalHeroSlotKey, { icon: typeof Building2; from: string; to: string }> = {
  spaces: { icon: Building2, from: "from-primary-tint", to: "to-info-tint" },
  vehicles: { icon: Car, from: "from-info-tint", to: "to-ai-tint" },
  signage: { icon: Signpost, from: "from-ai-tint", to: "to-primary-tint" },
  displays: { icon: Monitor, from: "from-success-tint", to: "to-primary-tint" },
  graphics: { icon: Palette, from: "from-warning-tint", to: "to-success-tint" },
};

/**
 * Signed-in customer portal home page hero -- coded from the reference
 * banner (task feedback: "make beautiful page instead a jpeg upload",
 * then "Maintain the same design and recreate it, design looks flat"),
 * not a static image. A diagonal photo collage (5 named slots, uploaded
 * from Customer Portal workspace → Hero Banner tab) replaces the single
 * placeholder panel the first pass used. Every non-photo color here is
 * one of globals.css's existing semantic tokens (primary/ai/success/…) —
 * no new brand hex introduced — per this app's "components must
 * reference semantic tokens only" rule.
 */
export function PortalHeroBanner({
  greetingName,
  ctaHref,
}: {
  greetingName: string;
  ctaHref: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-surface shadow-2">
      <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_auto_1.3fr] lg:items-stretch">
        <div className="flex flex-col justify-center gap-3 p-6 sm:p-8 lg:p-10">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Welcome back, {greetingName}</p>
          <h1 className="text-3xl font-bold leading-[1.1] tracking-tight text-ink sm:text-4xl">
            Print Beyond
            <br />
            <span className="bg-gradient-to-r from-primary via-ai to-success bg-clip-text text-transparent">
              Possibilities.
            </span>
          </h1>
          <p className="max-w-sm text-sm text-ink-secondary sm:text-base">
            From ideas to impact — place a new order, track design approval, and follow every shipment right through to your stores.
          </p>

          <Link
            href={ctaHref}
            className="mt-2 inline-flex w-fit items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-brand shadow-1 transition-colors hover:bg-primary-hover"
          >
            Place Your Order
            <ArrowRight size={16} />
          </Link>

          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:flex sm:flex-wrap sm:gap-6">
            {TRUST_BADGES.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2">
                <Icon size={16} className="shrink-0 text-primary" />
                <span className="text-xs font-medium text-ink-secondary sm:text-sm">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Category list + script accent -- only where there's room for a
            third column beside the copy and the photo band, matching the
            reference's own layout; folded away below lg rather than
            squeezed in. */}
        <div className="hidden shrink-0 flex-col justify-center gap-1 whitespace-nowrap px-4 py-8 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary lg:flex">
          {PORTAL_HERO_SLOTS.map((s) => (
            <div key={s.key}>{s.label}</div>
          ))}
          <div className="text-ink-muted">and more...</div>
          <div className="mt-2 h-1 w-12 rounded-full bg-gradient-to-r from-primary via-ai to-success" aria-hidden="true" />
          <p className="mt-6 text-sm font-normal italic normal-case tracking-normal text-ink-muted">
            Ideas
            <br />
            in Every Space
          </p>
        </div>

        <div className="relative flex h-56 overflow-hidden sm:h-64 lg:h-auto lg:min-h-[320px]">
          {PORTAL_HERO_SLOTS.map((slot, i) => (
            <HeroSlotImage key={slot.key} slotKey={slot.key} label={slot.label} isFirst={i === 0} isLast={i === PORTAL_HERO_SLOTS.length - 1} />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 border-t border-line bg-surface-sunken px-4 py-2.5">
        <span className="h-px w-10 bg-gradient-to-r from-transparent to-primary sm:w-16" aria-hidden="true" />
        <span className="text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted">
          Graphics for a brighter tomorrow
        </span>
        <span className="h-px w-10 bg-gradient-to-l from-transparent to-success sm:w-16" aria-hidden="true" />
      </div>
      <div className="h-1.5 w-full bg-gradient-to-r from-primary via-ai to-success" aria-hidden="true" />
    </div>
  );
}

function HeroSlotImage({
  slotKey,
  label,
  isFirst,
  isLast,
}: {
  slotKey: PortalHeroSlotKey;
  label: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portal/hero-images/${slotKey}/preview-url`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled) setUrl(data.url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slotKey]);

  // A shared parallelogram clip on every panel, each slightly overlapping
  // the one before it, so the row reads as one continuous diagonal-cut
  // strip -- the last panel's right edge stays square so the strip ends
  // flush with the card's own rounded corner instead of a stray diagonal
  // notch.
  const clipPath = isLast ? "polygon(14% 0, 100% 0, 100% 100%, 0 100%)" : "polygon(14% 0, 100% 0, 86% 100%, 0 100%)";

  const placeholder = SLOT_PLACEHOLDER[slotKey];
  const Icon = placeholder.icon;

  return (
    <div className="relative min-w-0 flex-1 overflow-hidden bg-surface-sunken" style={{ clipPath, marginLeft: isFirst ? 0 : "-6%" }}>
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed R2 URL
        <img src={url} alt={label} className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <div className={`flex h-full w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br ${placeholder.from} ${placeholder.to}`}>
          {failed ? <ImageOff size={20} className="text-ink-muted" /> : <Icon size={22} className="text-ink-secondary" />}
        </div>
      )}
    </div>
  );
}
