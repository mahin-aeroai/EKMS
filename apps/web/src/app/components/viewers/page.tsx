import { PageHeader, DemoSection } from "@/components/DemoSection";
import { DocumentPreview, ImageViewer, PDFViewer, CADViewer } from "@/components/ui/Viewers";

export default function ViewersPage() {
  return (
    <div>
      <PageHeader
        title="Document & Media Viewers"
        description="Preview any document or media type in place, without leaving the workspace — the AI Document Intelligence layer builds on top of this."
      />

      <DemoSection title="Document Preview" deliverable="Deliverable 3.8" description="Shows a superseded banner when a newer version exists, so a user never acts on stale content unknowingly.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DocumentPreview title="SOP-0044 — Injection Molding Setup" summary="Standard operating procedure for setting up injection molding machines prior to a production run." tags={["SOP", "Manufacturing", "Rev 4"]} />
          <DocumentPreview title="Quality Manual v3" summary="Superseded by v4 — tolerance section updated on 12 Jul 2026." tags={["Quality", "Manual"]} superseded />
        </div>
      </DemoSection>

      <DemoSection title="Image Viewer" deliverable="Deliverable 3.8" description="Index and zoom controls for photo sets — machine condition photos, packaging proofs, site survey images.">
        <ImageViewer images={[
          { src: "/photo-1.jpg", alt: "Machine M-14, front panel" },
          { src: "/photo-2.jpg", alt: "Machine M-14, tooling detail" },
          { src: "/photo-3.jpg", alt: "Machine M-14, control panel" },
        ]} />
      </DemoSection>

      <DemoSection title="PDF Viewer" deliverable="Deliverable 3.8" description="Page-by-page navigation for contracts, drawings, and reports.">
        <PDFViewer title="Customer Contract — Reliance Retail Ltd" pageCount={14} />
      </DemoSection>

      <DemoSection title="CAD Viewer" deliverable="Deliverable 3.8" description="Layer toggles for engineering drawings — dimensions, tooling, and annotations can be shown independently.">
        <CADViewer layers={["Outline", "Dimensions", "Tooling Marks", "Annotations"]} />
      </DemoSection>
    </div>
  );
}
