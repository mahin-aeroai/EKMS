"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Trash2, Plus, UploadCloud, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { usePortalHost, portalHref } from "@/lib/portal-links";
import type { PortalCompanyStoreRow, PortalProductRow } from "@mmdi/shared/rows";

interface LineItem {
  productId: string;
  quantity: number;
}

export default function NewPortalOrderPage() {
  return (
    <Suspense fallback={null}>
      <NewOrderForm />
    </Suspense>
  );
}

function NewOrderForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const onPortalHost = usePortalHost();
  const preselectedProduct = searchParams.get("product");

  const [stores, setStores] = useState<PortalCompanyStoreRow[]>([]);
  const [products, setProducts] = useState<PortalProductRow[]>([]);
  const [storeId, setStoreId] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ productId: preselectedProduct ?? "", quantity: 1 }]);
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [storesRes, productsRes] = await Promise.all([
        supabase.from("portal_company_stores").select("*").eq("active", true).order("store_name"),
        supabase.from("portal_products").select("*").eq("active", true).order("code"),
      ]);
      setStores((storesRes.data ?? []) as PortalCompanyStoreRow[]);
      setProducts((productsRes.data ?? []) as PortalProductRow[]);
      setLoading(false);
    })();
  }, []);

  function productById(id: string) {
    return products.find((p) => p.id === id);
  }

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, { productId: "", quantity: 1 }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const subtotal = items.reduce((sum, it) => {
    const p = productById(it.productId);
    return sum + (p ? p.unit_price * it.quantity : 0);
  }, 0);
  const gstAmount = items.reduce((sum, it) => {
    const p = productById(it.productId);
    return sum + (p ? p.unit_price * it.quantity * (p.gst_percent / 100) : 0);
  }, 0);
  const total = subtotal + gstAmount;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const validItems = items.filter((it) => it.productId && it.quantity > 0);
    if (!storeId) {
      setError("Choose which store this order is for.");
      return;
    }
    if (validItems.length === 0) {
      setError("Add at least one product and quantity.");
      return;
    }

    setSubmitting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch("/api/portal/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({
          store_id: storeId,
          notes: notes.trim() || undefined,
          items: validItems.map((it) => ({ product_id: it.productId, quantity: it.quantity })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Couldn't place the order.");
        setSubmitting(false);
        return;
      }

      const orderId = data.id as string;

      for (const file of files) {
        const uploadRes = await fetch(`/api/portal/orders/${orderId}/files/upload-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
          body: JSON.stringify({ kind: "reference", file_name: file.name, content_type: file.type || "application/octet-stream" }),
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) continue;

        await fetch(uploadData.url, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
        await supabase.from("portal_order_files").insert({
          order_id: orderId,
          uploaded_by_role: "customer",
          uploaded_by: session?.user.id,
          relative_path: uploadData.relative_path,
          file_name: file.name,
          file_size: file.size,
          kind: "reference",
        });
      }

      router.push(portalHref(`/orders/${orderId}`, onPortalHost));
    } catch {
      setError("Something went wrong placing the order. Try again.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-ink-muted">Loading…</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ink">New order</h1>
        <p className="text-sm text-ink-muted">Choose a store and the products you need — no payment yet, MMDI will share a design proof first.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="store" className="text-sm font-medium text-ink-secondary">
          Store location
        </label>
        <select
          id="store"
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
        >
          <option value="">Select a store…</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.store_name}
              {store.city ? ` — ${store.city}` : ""}
            </option>
          ))}
        </select>
        {stores.length === 0 && (
          <p className="text-xs text-ink-muted">No store locations are set up on your account yet — contact MMDI.</p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-ink-secondary">Items</p>
        {items.map((item, index) => {
          const product = productById(item.productId);
          return (
            <div key={index} className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-3">
              <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
                <label className="text-xs text-ink-muted">Product</label>
                <select
                  value={item.productId}
                  onChange={(e) => updateItem(index, { productId: e.target.value })}
                  className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                >
                  <option value="">Select…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex w-24 flex-col gap-1.5">
                <label className="text-xs text-ink-muted">Qty</label>
                <input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => updateItem(index, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                  className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                />
              </div>
              {product && (
                <p className="text-sm text-ink-secondary">
                  ₹{(product.unit_price * item.quantity).toLocaleString("en-IN")}
                </p>
              )}
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-danger-tint hover:text-danger"
                  aria-label="Remove item"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={addItem}
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <Plus size={14} /> Add another product
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className="text-sm font-medium text-ink-secondary">
          Notes for MMDI (optional)
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
          placeholder="Any special instructions for this order…"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink-secondary">Reference files (optional)</label>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-surface p-6 text-center text-sm text-ink-muted hover:border-primary hover:text-primary">
          <UploadCloud size={20} />
          Click to attach reference files
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
          />
        </label>
        {files.length > 0 && (
          <ul className="flex flex-col gap-1">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between rounded-md bg-surface-sunken px-3 py-1.5 text-xs text-ink-secondary">
                {f.name}
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-ink-muted hover:text-danger"
                  aria-label={`Remove ${f.name}`}
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface-sunken p-4 text-sm">
        <div className="flex justify-between text-ink-secondary">
          <span>Subtotal</span>
          <span>₹{subtotal.toLocaleString("en-IN")}</span>
        </div>
        <div className="flex justify-between text-ink-secondary">
          <span>GST</span>
          <span>₹{gstAmount.toLocaleString("en-IN")}</span>
        </div>
        <div className="flex justify-between border-t border-line pt-1 font-semibold text-ink">
          <span>Estimated total</span>
          <span>₹{total.toLocaleString("en-IN")}</span>
        </div>
        <p className="mt-1 text-xs text-ink-muted">No payment now — you&apos;ll pay online once you approve the design proof.</p>
      </div>

      {error && <p className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>}

      <Button type="submit" loading={submitting} className="w-fit">
        Place order
      </Button>
    </form>
  );
}
