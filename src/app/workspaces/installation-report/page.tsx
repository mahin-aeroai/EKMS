"use client";

import dynamic from "next/dynamic";

// Same reasoning as cut-file-tool/page.tsx: this tool builds PDFs and reads
// local image files entirely in the browser (pdf-lib + canvas), neither of
// which exist in the Node.js environment Next.js uses to prerender pages
// during `next build`. ssr: false keeps it out of the server render.
const InstallationReportClient = dynamic(
  () => import("@/components/installationReport/InstallationReportClient"),
  {
    ssr: false,
    loading: () => <p className="py-10 text-center text-sm text-ink-muted">Loading Installation Report…</p>,
  }
);

export default function InstallationReportPage() {
  return <InstallationReportClient />;
}
