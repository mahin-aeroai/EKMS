import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ProductGrid } from "@/components/portal/ProductGrid";
import type { PortalProductRow } from "@mmdi/shared/rows";

export const dynamic = "force-dynamic";

export default async function PortalProductsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: products, error } = await supabase
    .from("portal_products")
    .select("id, code, name, description, unit_price, gst_percent, preview_image_path, version, active, updated_at")
    .eq("active", true)
    .order("code", { ascending: true });

  if (error) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger-tint p-4 text-sm text-danger">
        Couldn&apos;t load products: {error.message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Products</h1>
        <p className="text-sm text-ink-muted">Pick a product to order for any of your store locations.</p>
      </div>
      <ProductGrid products={(products ?? []) as PortalProductRow[]} />
    </div>
  );
}
