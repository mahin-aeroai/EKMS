"use client";

import { useEffect, useRef, useState } from "react";
import { ImageOff, UploadCloud } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { PORTAL_HERO_SLOTS, type PortalHeroSlotKey } from "@/lib/portalHeroSlots";
import type { PortalHeroImageRow } from "@mmdi/shared/rows";

async function authHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` };
}

// Task feedback: "give images upload tool so that i can place them
// nicely" -- originally one upload slot per named panel in the home
// page's hero collage. 11 Sept 2026 follow-up ("make one image insert i
// will post the collage") collapsed the banner down to a single
// pre-made collage image, built outside the app and uploaded as one
// file -- so this tab now shows exactly one upload card instead of 5.
// PORTAL_HERO_SLOTS is still an array (portalHeroSlots.ts), just with
// one entry, so this still maps over it rather than hardcoding the key.
export function HeroBannerTab() {
  const [rows, setRows] = useState<PortalHeroImageRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("portal_hero_images")
      .select("*")
      .then(({ data }) => {
        setRows((data ?? []) as PortalHeroImageRow[]);
        setLoading(false);
      });
  }, []);

  function rowFor(slotKey: PortalHeroSlotKey) {
    return rows.find((r) => r.slot_key === slotKey) ?? null;
  }

  if (loading) return <p className="text-sm text-ink-muted">Loading…</p>;

  return (
    <div>
      <p className="mb-4 max-w-2xl text-sm text-ink-secondary">
        This image fills the right-hand side of the Customer Portal home page banner (portal.mmdi.in, once signed
        in). Upload a single wide collage/photo — a banner-shaped image (roughly 3:1 or wider) works best; with
        nothing uploaded yet, a plain color placeholder shows instead of a broken image.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:max-w-md">
        {PORTAL_HERO_SLOTS.map((slot) => (
          <HeroSlotCard key={slot.key} slotKey={slot.key} label={slot.label} row={rowFor(slot.key)} onUploaded={(row) => setRows((prev) => [...prev.filter((r) => r.slot_key !== slot.key), row])} />
        ))}
      </div>
    </div>
  );
}

function HeroSlotCard({
  slotKey,
  label,
  row,
  onUploaded,
}: {
  slotKey: PortalHeroSlotKey;
  label: string;
  row: PortalHeroImageRow | null;
  onUploaded: (row: PortalHeroImageRow) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const relativePath = row?.relative_path;
  useEffect(() => {
    // No row yet (slot never uploaded to) -- previewUrl already starts
    // null, nothing to fetch.
    if (!relativePath) return;
    let cancelled = false;
    fetch(`/api/portal/hero-images/${slotKey}/preview-url`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setPreviewUrl(data.url);
      });
    return () => {
      cancelled = true;
    };
    // Keyed on relativePath (not the whole row) so a re-upload to the same slot refetches a fresh signed URL for the new image.
  }, [slotKey, relativePath]);

  // Same defensive try/catch/finally shape as ProductsTab's own
  // handleImageChange, for the same reason: a failed PUT or an expired
  // 120s presigned URL must not leave the button stuck "Uploading…"
  // forever.
  async function handleImageChange(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const headers = await authHeaders();
      const uploadRes = await fetch(`/api/portal/hero-images/${slotKey}/upload-url`, {
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

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("portal_hero_images")
        .upsert(
          { slot_key: slotKey, relative_path: uploadData.relative_path, uploaded_by: user?.id ?? null, updated_at: new Date().toISOString() },
          { onConflict: "slot_key" }
        )
        .select()
        .single();
      if (error) {
        setUploadError(error.message);
        return;
      }
      if (data) onUploaded(data as PortalHeroImageRow);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed — check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3">
      <p className="text-sm font-semibold text-ink">{label}</p>
      <div className="flex aspect-[3/1] w-full items-center justify-center overflow-hidden rounded-md bg-surface-sunken">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed R2 URL
          <img src={previewUrl} alt={label} className="h-full w-full object-cover" />
        ) : (
          <ImageOff size={24} className="text-ink-muted" />
        )}
      </div>
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
      <Button size="sm" variant="secondary" loading={uploading} onClick={() => fileInputRef.current?.click()}>
        <UploadCloud size={14} className="mr-1.5" />
        {row ? "Replace" : "Upload"}
      </Button>
      {uploadError && <p className="text-xs text-danger">{uploadError}</p>}
    </div>
  );
}
