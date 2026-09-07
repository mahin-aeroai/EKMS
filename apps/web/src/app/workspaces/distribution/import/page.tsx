"use client";

import dynamic from "next/dynamic";
import { ToolAccessGuard } from "@/components/ToolAccessGuard";

// exceljs's browser build touches File/ArrayBuffer APIs that don't exist in
// the Node.js environment Next.js uses to prerender pages during `next
// build` -- same reasoning as Cut File Tool/Installation Report. ssr: false
// keeps it out of the server render; the whole import happens client-side.
const DistributionImportClient = dynamic(() => import("@/components/distribution/DistributionImportClient"), {
  ssr: false,
  loading: () => <p className="py-10 text-center text-sm text-ink-muted">Loading import…</p>,
});

export default function DistributionImportPage() {
  return (
    <ToolAccessGuard toolId="distribution" toolLabel="Distribution">
      <DistributionImportClient />
    </ToolAccessGuard>
  );
}
