"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ImageOff, Plus, UploadCloud } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { PortalProductRow } from "@mmdi/shared/rows";

async function authHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` };
}

export function ProductsTab() {
  const [products, setProducts] = useState<PortalProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    supabase
      .from("portal_products")
      .select("*")
      .order("code")
      .then(({ data }) => {
        setProducts((data ?? []) as PortalProductRow[]);
        setLoading(false);
      });
  }, []);

  if (loading) return <p className="text-sm text-ink-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">Catalog ({products.length})</p>
        <Button size="sm" variant="secondary" onClick={() => setShowNew((v) => !v)}>
          <Plus size={14} /> New product
        </Button>
      </div>

      {showNew && (
        <ProductForm
          onSaved={(p) => {
            setProducts((prev) => [...prev, p].sort((a, b) => a.code.localeCompare(b.code)));
            setShowNew(false);
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} onUpdated={(updated) => setProducts((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))} />
        ))}
      </div>
    </div>
  );
}

function ProductForm({ onSaved }: { onSaved: (product: PortalProductRow) => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [gstPercent, setGstPercent] = useState("18");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setError("Code and name are required.");
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from("portal_products")
      .insert({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description || null,
        unit_price: parseFloat(unitPrice) || 0,
        gst_percent: parseFloat(gstPercent) || 0,
      })
      .select()
      .single();
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    onSaved(data as PortalProductRow);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-md border border-line bg-surface-sunken p-3">
      <div className="grid grid-cols-2 gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Code (e.g. GPX04)"
          className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. Tactical Sign)"
          className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
        />
      </div>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          placeholder="Unit price (₹)"
          type="number"
          className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
        />
        <input
          value={gstPercent}
          onChange={(e) => setGstPercent(e.target.value)}
          placeholder="GST %"
          type="number"
          className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
        />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <Button size="sm" type="submit" loading={saving} className="w-fit">
        Create product
      </Button>
    </form>
  );
}

function ProductCard({ product, onUpdated }: { product: PortalProductRow; onUpdated: (product: PortalProductRow) => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [unitPrice, setUnitPrice] = useState(String(product.unit_price));
  const [active, setActive] = useState(product.active);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!product.preview_image_path) return;
    fetch(`/api/portal/products/${product.id}/preview-url`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setPreviewUrl(data.url));
  }, [product.id, product.preview_image_path]);

  // NOTE: everything here is wrapped in try/catch/finally on purpose -- an
  // earlier version had neither, so any failure (a rejected PUT to R2 from
  // a network hiccup, an expired 120s presigned URL, a CORS/extension
  // block, etc.) left the button stuck on "Uploading…" forever with no
  // error shown, recoverable only by reloading the page. The PUT's own
  // response status is also checked now -- fetch doesn't throw on a non-2xx
  // HTTP status, so an unchecked PUT could "succeed" while silently saving
  // a preview_image_path that points at nothing actually uploaded.
  async function handleImageChange(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const headers = await authHeaders();
      const uploadRes = await fetch(`/api/portal/products/${product.id}/preview-upload-url`, {
        method: "POST",
        headers,
        body: JSON.stringify({ content_type: file.type }),
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        setUploadError(uploadData?.message ?? "Could not get an upload URL.");
        return;
      }

      const putRes = await fetch(uploadData.url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!putRes.ok) {
        setUploadError(`Upload to storage failed (HTTP ${putRes.status}). Try again.`);
        return;
      }

      const { data, error } = await supabase
        .from("portal_products")
        .update({ preview_image_path: uploadData.relative_path, version: product.version + 1 })
        .eq("id", product.id)
        .select()
        .single();
      if (error) {
        setUploadError(error.message);
        return;
      }
      if (data) {
        onUpdated(data as PortalProductRow);
        const viewRes = await fetch(`/api/portal/products/${product.id}/preview-url`);
        if (viewRes.ok) setPreviewUrl((await viewRes.json()).url);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed — check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveDetails() {
    setSaving(true);
    const { data, error } = await supabase
      .from("portal_products")
      .update({ unit_price: parseFloat(unitPrice) || 0, active })
      .eq("id", product.id)
      .select()
      .single();
    setSaving(false);
    if (!error && data) onUpdated(data as PortalProductRow);
  }

  // Image on the left, details on the right -- a full-width A4-portrait
  // image stacked above the details made the card enormous (the whole
  // point of A4-portrait is a tall image, so stacking it just pushed
  // everything else far down). Keeping the image narrow and to the side
  // lets the card stay a normal compact height either way.
  return (
    <div className="flex gap-3 rounded-lg border border-line bg-surface p-3">
      <div className="relative w-28 shrink-0 sm:w-32">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed R2 URL
          <img src={previewUrl} alt={product.name} className="aspect-[210/297] w-full rounded-md object-cover" />
        ) : (
          <div className="flex aspect-[210/297] w-full items-center justify-center rounded-md bg-surface-sunken text-ink-muted">
            <ImageOff size={20} />
          </div>
        )}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="absolute bottom-1 right-1 flex items-center gap-1 rounded-md bg-surface/90 px-1.5 py-1 text-[11px] font-medium text-ink shadow-1 hover:bg-surface"
        >
          <UploadCloud size={11} /> {uploading ? "…" : "Change"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImageChange(file);
            e.target.value = "";
          }}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{product.code}</p>
          <p className="text-sm font-semibold text-ink">{product.name}</p>
        </div>
        {uploadError && <p className="text-xs text-danger">{uploadError}</p>}
        <div className="flex items-center gap-2">
          <input
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            type="number"
            className="w-24 rounded-md border border-line-strong bg-surface px-2 py-1 text-sm text-ink focus:border-primary focus:outline-none"
          />
          <span className="text-xs text-ink-muted">+ {product.gst_percent}% GST</span>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active in catalog
        </label>
        <div className="mt-auto flex items-center justify-between">
          <Badge status={active ? "success" : "neutral"}>{active ? "Active" : "Hidden"}</Badge>
          <Button size="sm" variant="secondary" onClick={handleSaveDetails} loading={saving}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
