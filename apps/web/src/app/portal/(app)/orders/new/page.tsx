"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Script from "next/script";
import { Trash2, Plus, UploadCloud, X, FileText, Store } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { CartPanel, type CartOrder } from "@/components/portal/CartPanel";
import { usePortalHost, portalHref } from "@/lib/portal-links";
import { usePortalUser } from "@/lib/PortalUserContext";
import type { PortalCompanyStoreRow, PortalProductRow } from "@mmdi/shared/rows";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

interface CartItem {
  productId: string;
  quantity: number;
  // Mandatory — each product needs its own artwork PDF; see
  // apps/web/src/app/api/portal/orders/[orderId]/files/upload-url/route.ts
  // for the matching server-side PDF-only enforcement.
  designFile: File | null;
}

// One group per store — the whole point of letting a customer add items
// for several stores in one visit without leaving this page. Checkout
// still creates one portal_orders row per group/store (each gets its own
// design-proof/approval/production tracking downstream, unchanged) but
// pays for all of them together in a single Razorpay Checkout popup — see
// /api/portal/orders/razorpay-combined-order.
interface CartGroup {
  storeId: string;
  items: CartItem[];
}

function emptyItem(productId = ""): CartItem {
  return { productId, quantity: 1, designFile: null };
}

function emptyGroup(productId = ""): CartGroup {
  return { storeId: "", items: [emptyItem(productId)] };
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
  const portalUser = usePortalUser();
  const preselectedProduct = searchParams.get("product");

  const [allStores, setAllStores] = useState<PortalCompanyStoreRow[]>([]);
  const [products, setProducts] = useState<PortalProductRow[]>([]);
  const [groups, setGroups] = useState<CartGroup[]>([emptyGroup(preselectedProduct ?? "")]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Orders already placed, keyed by their cart-group index -- survives a
  // FAILED submit (e.g. a design-file upload dying partway through), so
  // clicking "Place order & pay" again after a partial failure resumes
  // instead of creating a second, duplicate order for a group that already
  // has one. Without this, every group's order is unconditionally created
  // fresh on every submit attempt, and "try again" after any failure past
  // the order-creation step (which is most of this loop) silently doubles
  // up whichever group had already succeeded.
  const [committedOrders, setCommittedOrders] = useState<
    Record<number, { id: string; order_no: string; items: { id: string; product_id: string | null }[] }>
  >({});

  // The customer's "Cart" -- every order of theirs still unpaid, i.e.
  // genuinely unfinished (payment happens at checkout, before design-
  // approval/production even starts). Loaded alongside stores/products and
  // refetched after a cart action (pay or cancel) so it never goes stale.
  const [cartOrders, setCartOrders] = useState<CartOrder[]>([]);
  const [payingCartId, setPayingCartId] = useState<string | null>(null);
  const [cancellingCartId, setCancellingCartId] = useState<string | null>(null);
  // Includes inactive stores — a cart order's store label should still
  // resolve even if the store was deactivated after ordering.
  const [allStoreNames, setAllStoreNames] = useState<Record<string, string>>({});

  async function loadCart() {
    const { data } = await supabase
      .from("portal_orders")
      .select("*, portal_order_items(id, product_code, product_name, quantity)")
      .eq("payment_status", "unpaid")
      .neq("status", "cancelled")
      .order("created_at", { ascending: false });
    type CartOrderRaw = Omit<CartOrder, "items"> & { portal_order_items: CartOrder["items"] };
    setCartOrders(
      ((data ?? []) as CartOrderRaw[]).map((o) => ({
        ...o,
        items: o.portal_order_items ?? [],
      }))
    );
  }

  useEffect(() => {
    (async () => {
      const [storesRes, allStoresRes, productsRes] = await Promise.all([
        supabase.from("portal_company_stores").select("*").eq("active", true).order("store_name"),
        // Unfiltered (includes inactive) — a cart order's store label should
        // still resolve even if the store was deactivated after ordering.
        supabase.from("portal_company_stores").select("id, store_name"),
        supabase.from("portal_products").select("*").eq("active", true).order("code"),
        loadCart(),
      ]);
      setAllStores((storesRes.data ?? []) as PortalCompanyStoreRow[]);
      setAllStoreNames(Object.fromEntries(((allStoresRes.data ?? []) as { id: string; store_name: string }[]).map((s) => [s.id, s.store_name])));
      setProducts((productsRes.data ?? []) as PortalProductRow[]);
      setLoading(false);
    })();
  }, []);

  async function authHeaders() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` };
  }

  async function handlePayCartOrder(order: CartOrder) {
    setPayingCartId(order.id);
    setError(null);
    const headers = await authHeaders();
    const res = await fetch(`/api/portal/orders/${order.id}/razorpay-order`, { method: "POST", headers });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message || data.error || "Couldn't start payment for that order.");
      setPayingCartId(null);
      return;
    }
    if (!window.Razorpay) {
      setError("Payment isn't ready yet — wait a moment and try again.");
      setPayingCartId(null);
      return;
    }
    const razorpay = new window.Razorpay({
      key: data.key_id,
      amount: data.amount,
      currency: data.currency,
      order_id: data.razorpay_order_id,
      name: "MMDI",
      description: `Order ${data.order_no}`,
      prefill: { name: portalUser?.fullName ?? "", email: portalUser?.email ?? "" },
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        const verifyHeaders = await authHeaders();
        await fetch(`/api/portal/orders/${order.id}/razorpay-verify`, {
          method: "POST",
          headers: verifyHeaders,
          body: JSON.stringify(response),
        });
        setPayingCartId(null);
        router.push(portalHref(`/orders/${order.id}`, onPortalHost));
      },
      modal: {
        // Left the popup without paying — the order is still safe in the
        // cart, just still unpaid. Nothing to clean up.
        ondismiss: () => setPayingCartId(null),
      },
    });
    razorpay.open();
  }

  async function handleCancelCartOrder(order: CartOrder) {
    if (!window.confirm(`Cancel and delete order ${order.order_no}? This can't be undone.`)) return;
    setCancellingCartId(order.id);
    setError(null);
    const headers = await authHeaders();
    const res = await fetch(`/api/portal/orders/${order.id}`, { method: "DELETE", headers });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Couldn't cancel that order.");
      setCancellingCartId(null);
      return;
    }
    await loadCart();
    setCancellingCartId(null);
  }

  // A store missing its delivery address or GSTIN can't be ordered for —
  // enforced again server-side (POST /api/portal/orders) so this is a
  // convenience filter, not the real guard. See CompaniesTab.tsx for where
  // staff fill these in.
  const eligibleStores = allStores.filter((s) => s.address?.trim() && s.gstin?.trim());
  const incompleteStoreCount = allStores.length - eligibleStores.length;

  function productById(id: string) {
    return products.find((p) => p.id === id);
  }

  function updateGroup(gi: number, patch: Partial<CartGroup>) {
    setGroups((prev) => prev.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  }
  function updateItem(gi: number, ii: number, patch: Partial<CartItem>) {
    setGroups((prev) =>
      prev.map((g, i) => (i === gi ? { ...g, items: g.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) } : g))
    );
  }
  function addGroup() {
    setGroups((prev) => [...prev, emptyGroup()]);
  }
  function removeGroup(gi: number) {
    setGroups((prev) => prev.filter((_, i) => i !== gi));
  }
  function addItem(gi: number) {
    setGroups((prev) => prev.map((g, i) => (i === gi ? { ...g, items: [...g.items, emptyItem()] } : g)));
  }
  function removeItem(gi: number, ii: number) {
    setGroups((prev) => prev.map((g, i) => (i === gi ? { ...g, items: g.items.filter((_, j) => j !== ii) } : g)));
  }

  function groupTotals(group: CartGroup) {
    return group.items.reduce(
      (acc, it) => {
        const p = productById(it.productId);
        if (!p) return acc;
        const lineSubtotal = p.unit_price * it.quantity;
        const lineGst = lineSubtotal * (p.gst_percent / 100);
        return { subtotal: acc.subtotal + lineSubtotal, gst: acc.gst + lineGst };
      },
      { subtotal: 0, gst: 0 }
    );
  }

  const grand = groups.reduce(
    (acc, g) => {
      const t = groupTotals(g);
      return { subtotal: acc.subtotal + t.subtotal, gst: acc.gst + t.gst };
    },
    { subtotal: 0, gst: 0 }
  );
  const grandTotal = grand.subtotal + grand.gst;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Validate every group has a store and at least one complete item, and
    // every single item — the mandatory-PDF rule is per PRODUCT, not just
    // "somewhere on the order" — has its design file attached.
    for (const [gi, group] of groups.entries()) {
      if (!group.storeId) {
        setError(`Choose a store for cart section ${gi + 1}.`);
        return;
      }
      const validItems = group.items.filter((it) => it.productId && it.quantity > 0);
      if (validItems.length === 0) {
        setError(`Add at least one product to the order for ${allStores.find((s) => s.id === group.storeId)?.store_name ?? "that store"}.`);
        return;
      }
      for (const it of validItems) {
        if (!it.designFile) {
          const p = productById(it.productId);
          setError(`Attach a design PDF for ${p ? `${p.code} — ${p.name}` : "each product"} before placing this order.`);
          return;
        }
        if (it.designFile.type !== "application/pdf" && !it.designFile.name.toLowerCase().endsWith(".pdf")) {
          setError(`"${it.designFile.name}" isn't a PDF — the design file for each product must be a PDF.`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` };

      // Local mirror of committedOrders -- setState is async, so later
      // iterations in THIS SAME submit call need a synchronous read of
      // what's already been committed (both from a previous failed attempt,
      // and from earlier groups within this very call).
      const committedLocal = { ...committedOrders };

      for (const [gi, group] of groups.entries()) {
        const validItems = group.items.filter((it) => it.productId && it.quantity > 0);
        const store = allStores.find((s) => s.id === group.storeId);

        let orderId: string;
        let orderNo: string;
        let insertedItems: { id: string; product_id: string | null }[];

        const already = committedLocal[gi];
        if (already) {
          // This group's order was already created on a previous (failed)
          // submit attempt -- reuse it instead of placing a duplicate.
          // Guard against the cart having changed shape since then (an item
          // added/removed after the partial failure): the order's line
          // items are fixed at creation, so a mismatched count here would
          // silently zip the wrong design PDF to the wrong product below.
          const itemsMatch =
            already.items.length === validItems.length &&
            already.items.every((it, i) => it.product_id === validItems[i].productId);
          if (!itemsMatch) {
            throw new Error(
              `The order for ${store?.store_name ?? "this store"} (${already.order_no}) was already placed with a different set of items than ` +
                `what's in this cart section now. Reload the page and start a fresh order for this store rather than editing it here — the ` +
                `already-placed order itself is safe and visible in Orders.`
            );
          }
          orderId = already.id;
          orderNo = already.order_no;
          insertedItems = already.items;
        } else {
          setProgress(`Creating order for ${store?.store_name ?? "store"}…`);
          const res = await fetch("/api/portal/orders", {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              store_id: group.storeId,
              notes: notes.trim() || undefined,
              items: validItems.map((it) => ({ product_id: it.productId, quantity: it.quantity })),
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            const otherCommitted = Object.keys(committedLocal).length;
            throw new Error(
              `${data.message || data.error || "Couldn't place the order."}${
                otherCommitted > 0 ? ` (${otherCommitted} earlier order(s) in this checkout were already placed and are safe — see Orders.)` : ""
              }`
            );
          }

          orderId = data.id;
          orderNo = data.order_no;
          // Response items come back in the same order they were submitted
          // (see the route's own comment) — zip by index to know which
          // order_item_id each design PDF belongs to.
          insertedItems = (data.items ?? []) as { id: string; product_id: string | null }[];
          committedLocal[gi] = { id: orderId, order_no: orderNo, items: insertedItems };
          setCommittedOrders((prev) => ({ ...prev, [gi]: committedLocal[gi] }));
        }

        for (let i = 0; i < validItems.length; i++) {
          const item = validItems[i];
          const orderItemId = insertedItems[i]?.id;
          if (!item.designFile || !orderItemId) continue;

          const productLabel = productById(item.productId)?.code ?? "product";
          const designFileLabel = `the design file for ${productLabel} (${store?.store_name ?? "this store"})`;
          const otherCommitted = Object.keys(committedLocal).length - 1;
          const safetyNote =
            `The order for ${store?.store_name ?? "this store"} (${orderNo}) was already placed and is safe — it's just missing this file. ` +
            `Placing the order again for this store won't create a duplicate; it'll pick up right where this left off.` +
            (otherCommitted > 0 ? ` ${otherCommitted} other order(s) in this checkout were also placed successfully.` : "") +
            ` See Orders.`;

          setProgress(`Uploading design file for ${productLabel}…`);
          const uploadRes = await fetch(`/api/portal/orders/${orderId}/files/upload-url`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({ kind: "design", file_name: item.designFile.name, content_type: item.designFile.type || "application/pdf" }),
          });
          const uploadData = await uploadRes.json();
          // Was silently `continue`-ing here before -- the order would get
          // placed successfully but quietly missing its mandatory design
          // PDF, with no error shown at all. This IS a mandatory file, so
          // failing to even get an upload slot for it has to stop checkout
          // and say so, same as any other failure in this loop.
          if (!uploadRes.ok) {
            throw new Error(
              `Couldn't prepare an upload for ${designFileLabel}: ${uploadData.message || uploadData.error || "unknown error"}. ${safetyNote}`
            );
          }

          // Uploads straight to Cloudflare R2, not through our own server —
          // a *different* origin than portal.mmdi.in, so this is the one
          // request in this whole flow that a cross-origin (CORS) block
          // would actually surface as a raw, unhelpful browser network
          // error ("Load failed" on Safari, "Failed to fetch" on Chrome)
          // instead of a proper HTTP error status. Checking putRes.ok
          // catches an R2-side rejection (e.g. an expired presigned URL);
          // the catch block below is what catches the network-level
          // failure and gives it a message that actually says what to look at.
          let putRes: Response;
          try {
            putRes = await fetch(uploadData.url, {
              method: "PUT",
              headers: { "Content-Type": item.designFile.type || "application/pdf" },
              body: item.designFile,
            });
          } catch {
            throw new Error(
              `Couldn't upload ${designFileLabel} — the connection to file storage failed (browser said "Load failed"/"Failed to fetch"). ` +
                `This is usually either a network hiccup (try again) or, if it keeps happening from this device every time, MMDI should check ` +
                `that the file storage's CORS settings allow uploads from portal.mmdi.in specifically. ${safetyNote}`
            );
          }
          if (!putRes.ok) {
            throw new Error(`Couldn't upload ${designFileLabel} — file storage rejected the upload (status ${putRes.status}). ${safetyNote}`);
          }

          const { error: fileInsertError } = await supabase.from("portal_order_files").insert({
            order_id: orderId,
            order_item_id: orderItemId,
            uploaded_by_role: "customer",
            uploaded_by: session?.user.id,
            relative_path: uploadData.relative_path,
            file_name: item.designFile.name,
            file_size: item.designFile.size,
            kind: "design",
          });
          if (fileInsertError) {
            throw new Error(`Uploaded ${designFileLabel}, but couldn't attach it to the order: ${fileInsertError.message}. ${safetyNote}`);
          }
        }
      }

      // Every group now has a committed order (either just-created or
      // reused from a prior attempt) -- gather them in cart order for
      // payment.
      const createdOrders = groups.map((_, gi) => committedLocal[gi]).filter((o) => o != null) as {
        id: string;
        order_no: string;
      }[];

      // Pay for every order created in this checkout with one combined
      // Razorpay Checkout popup rather than one per store.
      setProgress("Preparing payment…");
      const payRes = await fetch("/api/portal/orders/razorpay-combined-order", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ order_ids: createdOrders.map((o) => o.id) }),
      });
      const payData = await payRes.json();
      if (!payRes.ok) {
        throw new Error(`${payData.message || payData.error || "Orders were placed, but payment couldn't start."} Find them in Orders to pay from there.`);
      }

      setProgress(null);
      setSubmitting(false);

      if (!window.Razorpay) {
        setError("Orders were placed, but payment isn't ready — open Orders and pay from there.");
        router.push(portalHref("/orders", onPortalHost));
        return;
      }

      const razorpay = new window.Razorpay({
        key: payData.key_id,
        amount: payData.amount,
        currency: payData.currency,
        order_id: payData.razorpay_order_id,
        name: "MMDI",
        description: createdOrders.length > 1 ? `${createdOrders.length} orders` : `Order ${createdOrders[0].order_no}`,
        prefill: { name: portalUser?.fullName ?? "", email: portalUser?.email ?? "" },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const verifyHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` };
          await fetch(`/api/portal/orders/${createdOrders[0].id}/razorpay-verify`, {
            method: "POST",
            headers: verifyHeaders,
            body: JSON.stringify(response),
          });
          router.push(portalHref(createdOrders.length > 1 ? "/orders" : `/orders/${createdOrders[0].id}`, onPortalHost));
        },
        modal: {
          // Orders are already placed at this point — closing the popup
          // just means payment didn't happen yet, not that the order
          // vanished. Send them somewhere they can pay from, rather than
          // leaving this form sitting there looking like nothing happened.
          ondismiss: () => {
            router.push(portalHref("/orders", onPortalHost));
          },
        },
      });
      razorpay.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong placing the order. Try again.");
      setSubmitting(false);
      setProgress(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-ink-muted">Loading…</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      <div>
        <h1 className="text-lg font-semibold text-ink">New order</h1>
        <p className="text-sm text-ink-muted">
          Add products for as many stores as you need, then pay for everything together — attach each product&apos;s design PDF as you go.
        </p>
        {incompleteStoreCount > 0 && (
          <p className="mt-1 text-xs text-warning">
            {incompleteStoreCount} store{incompleteStoreCount > 1 ? "s aren't" : " isn't"} available to order for yet — missing a delivery address or
            GSTIN. Contact MMDI to have {incompleteStoreCount > 1 ? "them" : "it"} added.
          </p>
        )}
      </div>

      <CartPanel
        orders={cartOrders}
        storeNames={allStoreNames}
        payingId={payingCartId}
        cancellingId={cancellingCartId}
        onPay={handlePayCartOrder}
        onCancel={handleCancelCartOrder}
      />

      {cartOrders.length > 0 && <h2 className="-mb-2 text-sm font-semibold text-ink">Start a new order</h2>}

      {groups.map((group, gi) => {
        const totals = groupTotals(group);
        const total = totals.subtotal + totals.gst;
        return (
          <div key={gi} className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
                <label className="flex items-center gap-1.5 text-sm font-medium text-ink-secondary">
                  <Store size={14} /> Store location
                </label>
                <select
                  value={group.storeId}
                  onChange={(e) => updateGroup(gi, { storeId: e.target.value })}
                  className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                >
                  <option value="">Select a store…</option>
                  {eligibleStores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.store_name}
                      {store.city ? ` — ${store.city}` : ""}
                    </option>
                  ))}
                </select>
                {eligibleStores.length === 0 && (
                  <p className="text-xs text-ink-muted">No store locations are ready to order for yet — contact MMDI.</p>
                )}
              </div>
              {groups.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeGroup(gi)}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-danger-tint hover:text-danger"
                  aria-label="Remove this store's items"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            <div className="flex flex-col gap-3">
              {group.items.map((item, ii) => {
                const product = productById(item.productId);
                return (
                  <div key={ii} className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface-sunken p-3">
                    <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
                      <label className="text-xs text-ink-muted">Product</label>
                      <select
                        value={item.productId}
                        onChange={(e) => updateItem(gi, ii, { productId: e.target.value })}
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
                        onChange={(e) => updateItem(gi, ii, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                        className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div className="flex min-w-[180px] flex-col gap-1.5">
                      <label className="text-xs text-ink-muted">Design PDF (required)</label>
                      {item.designFile ? (
                        <span className="flex items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 py-2 text-xs text-ink-secondary">
                          <FileText size={13} className="shrink-0 text-primary" />
                          <span className="truncate">{item.designFile.name}</span>
                          <button
                            type="button"
                            onClick={() => updateItem(gi, ii, { designFile: null })}
                            className="ml-auto shrink-0 text-ink-muted hover:text-danger"
                            aria-label="Remove design file"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ) : (
                        <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-line-strong bg-surface px-3 py-2 text-xs text-ink-muted hover:border-primary hover:text-primary">
                          <UploadCloud size={13} />
                          Attach PDF
                          <input
                            type="file"
                            accept="application/pdf,.pdf"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) updateItem(gi, ii, { designFile: file });
                            }}
                          />
                        </label>
                      )}
                    </div>
                    {product && (
                      <p className="text-sm text-ink-secondary">₹{(product.unit_price * item.quantity).toLocaleString("en-IN")}</p>
                    )}
                    {group.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(gi, ii)}
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
                onClick={() => addItem(gi)}
                className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <Plus size={14} /> Add another product to this store
              </button>
            </div>

            <p className="text-right text-sm text-ink-secondary">
              Store total: <span className="font-semibold text-ink">₹{total.toLocaleString("en-IN")}</span>
            </p>
          </div>
        );
      })}

      <button type="button" onClick={addGroup} className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline">
        <Plus size={14} /> Add another store to this order
      </button>

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
          placeholder="Any special instructions — applies to every store's order in this checkout…"
        />
      </div>

      <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface-sunken p-4 text-sm">
        <div className="flex justify-between text-ink-secondary">
          <span>Subtotal</span>
          <span>₹{grand.subtotal.toLocaleString("en-IN")}</span>
        </div>
        <div className="flex justify-between text-ink-secondary">
          <span>GST</span>
          <span>₹{grand.gst.toLocaleString("en-IN")}</span>
        </div>
        <div className="flex justify-between border-t border-line pt-1 font-semibold text-ink">
          <span>Total to pay now</span>
          <span>₹{grandTotal.toLocaleString("en-IN")}</span>
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          {groups.length > 1
            ? `Pays for all ${groups.length} stores' orders in one payment.`
            : "You'll pay online right after placing this order."}
        </p>
      </div>

      {error && <p className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>}

      <Button type="submit" loading={submitting} className="w-fit">
        {progress ?? "Place order & pay"}
      </Button>
    </form>
  );
}
