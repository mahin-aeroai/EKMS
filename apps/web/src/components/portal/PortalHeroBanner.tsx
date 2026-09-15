import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Signed-in customer portal home page hero.
 *
 * 15 Sept 2026: task feedback -- "remove hero banner and make it flat band
 * and make it nicely placed a bit height more." Replaces the uploaded-
 * collage-image banner (see git history on this file: afb0efb / 73a35fe /
 * a9636c3 for the earlier photo/collage iterations) with a coded, flat
 * single-color band -- no photo, no client-side fetch to
 * /api/portal/hero-images, no dependency on staff having uploaded
 * anything. Content is centered both ways with generous vertical padding
 * for the requested extra height, instead of being driven by an uploaded
 * image's own aspect ratio.
 *
 * The Hero Banner tab (Customer Portal workspace) and its upload API still
 * exist and still work -- nothing here was deleted, this component just no
 * longer renders what's uploaded there. Worth revisiting if that tab
 * should be removed too, now that nothing displays its output.
 */
export function PortalHeroBanner({ ctaHref }: { ctaHref: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-primary px-6 py-14 text-center shadow-2 sm:py-20">
      <h1 className="text-2xl font-bold tracking-tight text-on-brand sm:text-4xl">Print Beyond Possibilities.</h1>
      <p className="max-w-md text-sm text-on-brand/85 sm:text-base">
        Place a new order, track design approval, and follow every shipment right through to your stores.
      </p>
      <Link
        href={ctaHref}
        className="mt-3 inline-flex items-center gap-2 rounded-full bg-surface px-5 py-2.5 text-sm font-semibold text-primary shadow-1 transition-colors hover:bg-surface-sunken"
      >
        Place Your Order
        <ArrowRight size={16} />
      </Link>
    </div>
  );
}
