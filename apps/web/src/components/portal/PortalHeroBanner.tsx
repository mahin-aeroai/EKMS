"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Images } from "lucide-react";
import { PORTAL_HERO_SLOTS } from "@/lib/portalHeroSlots";

const HERO_SLOT_KEY = PORTAL_HERO_SLOTS[0].key;

// Purely decorative category list beside the copy -- no longer tied to
// individual upload slots (there's only one now, the collage image
// itself), just the same category names the reference mockup showed.
const HERO_CATEGORY_LABELS = ["Spaces", "Vehicles", "Signage", "Displays", "Graphics"];

/**
 * Signed-in customer portal home page hero -- coded from the reference
 * banner (task feedback: "make beautiful page instead a jpeg upload",
 * then "Maintain the same design and recreate it, design looks flat"),
 * not a static image.
 *
 * 11 Sept 2026: task feedback -- "Remove from ideas text, trusted quality,
 * relaible fulfullment, sustainable solutins, end to end support also
 * remove graphics for brighter tomorrow line. reduce height to 40% . make
 * one image insert i will post the collage." Pared back from the trust
 * badge row + 5-slot diagonal photo collage + category script line + tagline
 * strip down to just: headline/CTA/category list on the left, one
 * staff-uploaded collage image (built outside the app, uploaded as a
 * single file from Customer Portal → Hero Banner) on the right, at roughly
 * 40% of the previous overall height. Every non-photo color here is still
 * one of globals.css's existing semantic tokens (primary/ai, portal-themed) —
 * no
 * new brand hex introduced.
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
        <div className="flex flex-col justify-center gap-1.5 p-4 sm:p-5 lg:p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Welcome back, {greetingName}</p>
          <h1 className="text-xl font-bold leading-[1.1] tracking-tight text-ink sm:text-2xl">
            Print Beyond
            <br />
            <span className="bg-gradient-to-r from-primary to-ai bg-clip-text text-transparent">
              Possibilities.
            </span>
          </h1>
          <p className="max-w-sm text-xs text-ink-secondary sm:text-sm">
            From ideas to impact — place a new order, track design approval, and follow every shipment right through to your stores.
          </p>

          <Link
            href={ctaHref}
            className="mt-1.5 inline-flex w-fit items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-brand shadow-1 transition-colors hover:bg-primary-hover"
          >
            Place Your Order
            <ArrowRight size={16} />
          </Link>
        </div>

        {/* Category list -- only where there's room for a third column
            beside the copy and the photo, matching the reference's own
            layout; folded away below lg rather than squeezed in. The
            script-styled "Ideas in Every Space" line that used to sit
            beneath it was dropped per task feedback. */}
        <div className="hidden shrink-0 flex-col justify-center gap-1 whitespace-nowrap px-4 py-4 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary lg:flex">
          {HERO_CATEGORY_LABELS.map((label) => (
            <div key={label}>{label}</div>
          ))}
          <div className="text-ink-muted">and more...</div>
          <div className="mt-2 h-1 w-12 rounded-full bg-gradient-to-r from-primary to-ai" aria-hidden="true" />
        </div>

        <div className="relative h-24 overflow-hidden sm:h-28 lg:h-auto lg:min-h-[130px]">
          <HeroCollageImage />
        </div>
      </div>

      <div className="h-1.5 w-full bg-gradient-to-r from-primary to-ai" aria-hidden="true" />
    </div>
  );
}

function HeroCollageImage() {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portal/hero-images/${HERO_SLOT_KEY}/preview-url`)
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
  }, []);

  return (
    <div className="relative h-full w-full bg-surface-sunken">
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed R2 URL
        <img src={url} alt="MMDI print work" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-tint to-ai-tint">
          <Images size={22} className="text-ink-secondary" />
        </div>
      )}
    </div>
  );
}
