"use client";

import dynamic from "next/dynamic";
import { ToolAccessGuard } from "@/components/ToolAccessGuard";

// pdf-lib (via labelPdf.ts) touches browser-only APIs at module evaluation
// time -- same reasoning as every other Tool that generates PDFs client-side
// (Installation Report, Site Survey Report, Cut File Tool). ssr: false keeps
// it out of the server render. DistributionWorkspaceClient reads ?season=
// from window.location itself (see its own comment) rather than through a
// prop threaded from here, so there's no risk of this page's own
// window.location read racing the dynamic import's mount.
const DistributionWorkspaceClient = dynamic(() => import("@/components/distribution/DistributionWorkspaceClient"), {
  ssr: false,
  loading: () => <p className="py-10 text-center text-sm text-ink-muted">Loading Distribution…</p>,
});

export default function DistributionPage() {
  return (
    <ToolAccessGuard toolId="distribution" toolLabel="Distribution">
      <DistributionWorkspaceClient />
    </ToolAccessGuard>
  );
}
