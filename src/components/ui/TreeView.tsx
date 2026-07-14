"use client";

import { useState } from "react";
import { ChevronRight, Folder } from "lucide-react";
import { cn } from "@/lib/cn";

export interface TreeNode {
  id: string;
  label: string;
  children?: TreeNode[];
}

/**
 * Tree View — Deliverable 3.3
 * Purpose: hierarchical navigation (org structure, cost-center roll-up, BOM).
 * Behaviour: expand/collapse per node, lazy-loads children on first expand in production
 * (this demo renders the full provided tree since data is already in memory).
 */
export function TreeView({ nodes, level = 0 }: { nodes: TreeNode[]; level?: number }) {
  return (
    <ul className={cn(level > 0 && "ml-4 border-l border-line pl-3")}>
      {nodes.map((node) => (
        <TreeItem key={node.id} node={node} />
      ))}
    </ul>
  );
}

function TreeItem({ node }: { node: TreeNode }) {
  const [open, setOpen] = useState(false);
  const hasChildren = Boolean(node.children?.length);
  return (
    <li>
      <button
        onClick={() => hasChildren && setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-surface-sunken"
        aria-expanded={hasChildren ? open : undefined}
      >
        {hasChildren ? (
          <ChevronRight size={14} className={cn("shrink-0 transition-transform", open && "rotate-90")} />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <Folder size={14} className="shrink-0 text-ink-muted" />
        {node.label}
      </button>
      {hasChildren && open && <TreeView nodes={node.children!} level={1} />}
    </li>
  );
}
