"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader, DemoSection } from "@/components/DemoSection";
import { Button } from "@/components/ui/Button";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { Tag } from "@/components/ui/Tag";
import { Badge } from "@/components/ui/Badge";
import { PromptInput } from "@/components/ui/PromptInput";
import { Tooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Notifications";

const SUPPLIER_OPTIONS: DropdownOption[] = [
  { value: "s1", label: "Reliance Polymers" },
  { value: "s2", label: "Kansai Nerolac", suggested: true },
  { value: "s3", label: "Asian Paints Industrial" },
  { value: "s4", label: "Huhtamaki Flexibles" },
  { value: "s5", label: "UFlex Ltd" },
  { value: "s6", label: "Cosmo Films" },
  { value: "s7", label: "Jindal Poly Films" },
  { value: "s8", label: "SRF Limited" },
  { value: "s9", label: "Polyplex Corporation" },
  { value: "s10", label: "Chiripal Poly Films" },
  { value: "s11", label: "Manjushree Technopack" },
];

export default function InputsPage() {
  const { toast } = useToast();
  const [single, setSingle] = useState<string>("s2");
  const [multi, setMulti] = useState<string[]>(["s1", "s3"]);
  const [tags, setTags] = useState(["ICC: ISO Coated v2", "Substrate: BOPP 20µ", "PVC-free"]);

  return (
    <div>
      <PageHeader
        title="Inputs & Actions"
        description="Buttons, selection controls, tags, badges, and the AI prompt input — the primitives every form and toolbar is composed from."
      />

      <DemoSection title="Button" deliverable="Deliverable 3.1" description="Primary, Secondary, Ghost, Destructive and Icon variants, each in three sizes.">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => toast("success", "Purchase Order PO-MU-2026-004521 sent to Supplier X")}>Primary action</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Delete record</Button>
          <Button variant="icon" aria-label="Add"><Plus size={16} /></Button>
          <Button loading>Saving…</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>
      </DemoSection>

      <DemoSection title="Dropdown" deliverable="Deliverable 3.1" description="Searchable beyond 10 options; AI-suggested options are grouped and labeled ahead of the rest.">
        <div className="flex flex-wrap gap-6">
          <div className="w-64">
            <Dropdown label="Preferred supplier" options={SUPPLIER_OPTIONS} value={single} onChange={(v) => setSingle(v as string)} />
          </div>
          <div className="w-64">
            <Dropdown label="Approved suppliers" options={SUPPLIER_OPTIONS} value={multi} onChange={(v) => setMulti(v as string[])} multi />
          </div>
        </div>
      </DemoSection>

      <DemoSection title="Tag" deliverable="Deliverable 3.1" description="Removable metadata chips; the ai-suggested variant marks a value the AI proposed rather than the user.">
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <Tag key={t} onRemove={() => setTags((cur) => cur.filter((x) => x !== t))}>{t}</Tag>
          ))}
          <Tag aiSuggested>Recommended: FSC-certified liner</Tag>
          <Tag selected>Selected filter</Tag>
        </div>
      </DemoSection>

      <DemoSection title="Badge" deliverable="Deliverable 3.1" description="Status pills, notification counts, and dot indicators — always paired with an sr-only label.">
        <div className="flex flex-wrap items-center gap-4">
          <Badge status="success">Approved</Badge>
          <Badge status="warning">Pending</Badge>
          <Badge status="danger">Rejected</Badge>
          <Badge status="info">In Review</Badge>
          <Badge status="neutral">Draft</Badge>
          <Badge count={7} />
          <Badge dot status="success">Online</Badge>
        </div>
      </DemoSection>

      <DemoSection title="Tooltip" deliverable="Deliverable 3.1" description="400ms delayed show on hover or focus, dismissible with Escape.">
        <Tooltip content="OEE = Availability × Performance × Quality">
          <Button variant="secondary">Hover for OEE definition</Button>
        </Tooltip>
      </DemoSection>

      <DemoSection title="Prompt Input" deliverable="Deliverable 7.1" description="The universal entry point to the AI Assistant, embedded contextually across workspaces.">
        <PromptInput onSubmit={(v) => toast("info", `Asked: "${v}"`)} />
      </DemoSection>
    </div>
  );
}
