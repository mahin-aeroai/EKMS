"use client";

import dynamic from "next/dynamic";
import { ToolAccessGuard } from "@/components/ToolAccessGuard";

// exceljs's browser build touches File/ArrayBuffer APIs that don't exist in
// the Node.js environment Next.js uses to prerender pages during `next
// build` -- same reasoning as the Distribution Brief / Rate Card import
// pages. ssr: false keeps it out of the server render.
const TrackingDetailClient = dynamic(() => import("@/components/distribution/TrackingDetailClient"), {
  ssr: false,
  loading: () => <p className="py-10 text-center text-sm text-ink-muted">Loading…</p>,
});

export default function DistributionTrackingDetailPage() {
  return (
    <ToolAccessGuard toolId="distribution" toolLabel="Distribution">
      <TrackingDetailClient />
    </ToolAccessGuard>
  );
}
