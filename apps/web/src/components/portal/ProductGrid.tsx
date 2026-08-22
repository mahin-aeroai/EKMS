"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageOff } from "lucide-react";
import type { PortalProductRow } from "@mmdi/shared/rows";
import { Button } from "@/components/ui/Button";
import { usePortalHost, portalHref } from "@/lib/portal-links";

function ProductPreview({ productId, name }: { productId: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portal/products/${productId}/preview-url`)
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
  }, [productId]);

  // A4-portrait aspect (210:297) to match the real sign artwork's own shape
  // instead of a short landscape crop -- GPX04/GPX05 previews are vertical
  // designs, not wide banners. That tallness is exactly why this renders
  // narrow and beside the details (see the card markup below), not
  // full-width above them -- a full-width A4-portrait image stacked above
  // the details made each card enormous, the same problem already fixed
  // once in the staff-facing product editor (ProductsTab.tsx) — same fix,
  // applied here too.
  if (failed || !url) {
    return (
      <div className="flex aspect-[210/297] w-full items-center justify-center rounded-md bg-surface-sunken text-ink-muted">
        <ImageOff size={24} />
      </div>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed R2 URL, next/image can't cache/optimize a URL that expires in minutes
  return <img src={url} alt={name} className="aspect-[210/297] w-full rounded-md object-cover" />;
}

export function ProductGrid({ products }: { products: PortalProductRow[] }) {
  const router = useRouter();
  const onPortalHost = usePortalHost();

  if (products.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-surface p-6 text-center text-sm text-ink-muted">
        No products are available to order right now — contact MMDI.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {products.map((product) => (
        <div key={product.id} className="flex gap-2.5 rounded-lg border border-line bg-surface p-3 shadow-1">
          <div className="w-28 shrink-0 sm:w-32">
            {product.preview_image_path ? (
              <ProductPreview productId={product.id} name={product.name} />
            ) : (
              <div className="flex aspect-[210/297] w-full items-center justify-center rounded-md bg-surface-sunken text-ink-muted">
                <ImageOff size={24} />
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{product.code}</p>
              <p className="text-sm font-semibold text-ink">{product.name}</p>
              {product.description && <p className="mt-1 text-xs text-ink-secondary">{product.description}</p>}
            </div>
            <div className="mt-auto flex flex-col gap-2">
              <p className="text-sm font-semibold text-ink">
                ₹{product.unit_price.toLocaleString("en-IN")}{" "}
                <span className="text-xs font-normal text-ink-muted">+ {product.gst_percent}% GST</span>
              </p>
              <Button size="sm" onClick={() => router.push(portalHref(`/orders/new?product=${product.id}`, onPortalHost))}>
                Order this
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
