"use client";

import dynamic from "next/dynamic";
import { ToolAccessGuard } from "@/components/ToolAccessGuard";

// Same reasoning as installation-report/page.tsx / cut-file-tool/page.tsx:
// this editor builds PDFs and rasterizes uploaded ones entirely in the
// browser (pdf-lib + pdfjs-dist + canvas), none of which exist in the
// Node.js environment Next.js uses to prerender pages during `next build`.
// ssr: false keeps it out of the server render -- but ssr: false can only
// be passed to next/dynamic from a Client Component, hence this small
// wrapper file existing separately from the (Server Component)
// [reportId]/page.tsx that renders it.
const SiteSurveyReportEditorClient = dynamic(
  () => import("@/components/siteSurveyReport/SiteSurveyReportEditorClient").then((m) => m.SiteSurveyReportEditorClient),
  {
    ssr: false,
    loading: () => <p className="py-10 text-center text-sm text-ink-muted">Loading Site Survey Report…</p>,
  }
);

export function SiteSurveyReportEditorPageClient({ reportId }: { reportId: string }) {
  return (
    <ToolAccessGuard toolId="site-survey-report" toolLabel="Site Survey Reports">
      <SiteSurveyReportEditorClient reportId={reportId} />
    </ToolAccessGuard>
  );
}
