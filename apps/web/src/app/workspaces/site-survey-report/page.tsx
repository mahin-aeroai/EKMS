"use client";

import dynamic from "next/dynamic";
import { ToolAccessGuard } from "@/components/ToolAccessGuard";

// Same ssr:false reasoning as [reportId]/page.tsx's wrapper -- this list
// page doesn't itself touch pdf-lib/pdfjs-dist, but keeping every page in
// this tool on the same client-only pattern avoids a mixed-rendering trap
// later (e.g. a future "quick preview" action added straight to a list
// row).
const SiteSurveyReportsListClient = dynamic(
  () => import("@/components/siteSurveyReport/SiteSurveyReportsListClient").then((m) => m.SiteSurveyReportsListClient),
  {
    ssr: false,
    loading: () => <p className="py-10 text-center text-sm text-ink-muted">Loading Site Survey Reports…</p>,
  }
);

export default function SiteSurveyReportsPage() {
  return (
    <ToolAccessGuard toolId="site-survey-report" toolLabel="Site Survey Reports">
      <SiteSurveyReportsListClient />
    </ToolAccessGuard>
  );
}
