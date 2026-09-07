"use client";

import dynamic from "next/dynamic";
import { ToolAccessGuard } from "@/components/ToolAccessGuard";

// exceljs's browser build touches File/ArrayBuffer APIs that don't exist in
// the Node.js environment Next.js uses to prerender pages during `next
// build` -- same reasoning as the Distribution Brief import page. ssr: false
// keeps it out of the server render.
const RateCardImportClient = dynamic(() => import("@/components/distribution/RateCardImportClient"), {
  ssr: false,
  loading: () => <p className="py-10 text-center text-sm text-ink-muted">Loading…</p>,
});

export default function DistributionRateCardPage() {
  return (
    <ToolAccessGuard toolId="distribution" toolLabel="Distribution">
      <RateCardImportClient />
    </ToolAccessGuard>
  );
}
