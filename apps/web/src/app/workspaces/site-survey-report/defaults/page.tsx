"use client";

import dynamic from "next/dynamic";
import { ToolAccessGuard } from "@/components/ToolAccessGuard";

// Same client-only reasoning as the sibling site-survey-report pages --
// this one doesn't touch pdf-lib/pdfjs-dist itself, but keeping every page
// in this tool on the same dynamic-import pattern avoids a mixed-rendering
// trap later.
const SiteSurveyReportDefaultsClient = dynamic(
  () => import("@/components/siteSurveyReport/SiteSurveyReportDefaultsClient").then((m) => m.SiteSurveyReportDefaultsClient),
  {
    ssr: false,
    loading: () => <p className="py-10 text-center text-sm text-ink-muted">Loading Default Answers…</p>,
  }
);

export default function SiteSurveyReportDefaultsPage() {
  return (
    <ToolAccessGuard toolId="site-survey-report" toolLabel="Site Survey Reports">
      <SiteSurveyReportDefaultsClient />
    </ToolAccessGuard>
  );
}
