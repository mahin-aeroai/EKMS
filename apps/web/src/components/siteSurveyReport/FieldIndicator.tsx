import { CheckCircle2, AlertTriangle, Circle } from "lucide-react";
import type { FieldSource } from "@/lib/siteSurveyReport/types";

// The ✓ auto-extracted / ⚠ needs confirmation / ○ blank indicator the user
// asked for beside every AI-extractable field. Renders nothing for a
// manually-created report (field_sources stays empty) -- there's nothing
// useful to say about a field nobody's asked AI to look at. Once the AI
// extraction milestone lands, "ai" sources render ⚠ (needs confirmation,
// not a green check) rather than "ai" = done -- extracted fields are
// exactly the ones the user still needs to glance at and confirm; "user"
// (someone already edited it, whether it started as AI-filled or blank) is
// the only state that reads as fully settled. "Confirmed" uses text-info
// (blue) rather than the more conventional text-success (green) per
// feedback disliking the green check -- info was picked over the design
// system's own text-ai (purple) since that token is already the app-wide
// signal for "AI-related" elsewhere (Copilot, AI Knowledge, etc.), and
// reusing it here for a *confirmed-by-a-human* field would read backwards.
export function FieldIndicator({ source }: { source: FieldSource | undefined }) {
  if (!source) return null;
  if (source === "user") {
    return (
      <span title="Confirmed" className="inline-flex items-center text-info">
        <CheckCircle2 size={13} />
      </span>
    );
  }
  if (source === "ai") {
    return (
      <span title="AI extracted — please confirm" className="inline-flex items-center text-warning">
        <AlertTriangle size={13} />
      </span>
    );
  }
  return (
    <span title="Needs input" className="inline-flex items-center text-ink-muted">
      <Circle size={13} />
    </span>
  );
}
