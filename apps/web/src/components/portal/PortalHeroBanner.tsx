"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Images } from "lucide-react";
import { PORTAL_HERO_SLOTS } from "@/lib/portalHeroSlots";

const HERO_SLOT_KEY = PORTAL_HERO_SLOTS[0].key;

/**
 * Signed-in customer portal home page hero.
 *
 * 11 Sept 2026, this round: task feedback -- "lets place the complete
 * banner in image format so remoce the card in banner header." Every
 * earlier version of this component (headline/CTA/category list column +
 * image, then simplified to headline/CTA + single image) coded a layout
 * around a photo. Now that Mahin is uploading one complete, pre-designed
 * banner graphic (its own headline, category list, and icons already
 * baked into the image itself -- see the Hero Banner tab in Customer
 * Portal workspace), that coded layout duplicated what the image already
 * shows. This is now just the uploaded image, full width, un-cropped
 * (natural aspect ratio, not object-cover) so it renders exactly as
 * designed -- wrapped in a link to `ctaHref` so the banner is still
 * clickable even with no visible button on top of it.
 */
export function PortalHeroBanner({ ctaHref }: { ctaHref: string }) {
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
    <Link href={ctaHref} className="block overflow-hidden rounded-xl border border-line bg-surface shadow-2">
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed R2 URL, and this is the whole banner (no crop) so next/image's fixed-box sizing doesn't fit
        <img src={url} alt="MMDI — Print Beyond Possibilities" className="h-auto w-full" onError={() => setFailed(true)} />
      ) : (
        <div className="flex aspect-[3/1] w-full items-center justify-center bg-gradient-to-br from-primary-tint to-ai-tint">
          <Images size={28} className="text-ink-secondary" />
        </div>
      )}
    </Link>
  );
}
