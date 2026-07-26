"use client";

import { useState } from "react";

export interface GraphNode {
  id: string;
  label: string;
  type: string;
}
export interface GraphEdge {
  from: string;
  to: string;
  label: string;
}

/**
 * Relationship Graph — Deliverable 3.7
 * Purpose: visualize Knowledge Graph connections around a record.
 * Behaviour: click a connected node to re-center the graph on it.
 * Accessibility: an accessible list-view alternative is always available alongside this.
 * Responsive: Desktop/Tablet-only; Mobile shows the list-view by default.
 */
export function RelationshipGraph({
  center,
  nodes,
  edges,
  onRecenter,
}: {
  center: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  onRecenter?: (nodeId: string) => void;
}) {
  const [listView, setListView] = useState(false);
  const radius = 110;
  const cx = 180;
  const cy = 150;

  const positioned = nodes.map((n, i) => {
    const angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2;
    return { ...n, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });

  return (
    <div>
      <button
        onClick={() => setListView((v) => !v)}
        className="mb-2 text-xs font-medium text-primary hover:underline"
      >
        {listView ? "Show graph view" : "Show accessible list view"}
      </button>

      {listView ? (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {edges.map((e) => (
            <li key={e.from + e.to} className="flex items-center justify-between px-4 py-2 text-sm">
              <span className="text-ink">
                {center.label} <span className="text-ink-muted">{e.label}</span>{" "}
                <button onClick={() => onRecenter?.(e.to)} className="font-medium text-primary hover:underline">
                  {nodes.find((n) => n.id === e.to)?.label}
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <svg viewBox="0 0 360 300" className="w-full max-w-md" role="img" aria-label="Relationship graph">
          {edges.map((e) => {
            const target = positioned.find((n) => n.id === e.to);
            if (!target) return null;
            return (
              <line
                key={e.from + e.to}
                x1={cx}
                y1={cy}
                x2={target.x}
                y2={target.y}
                stroke="var(--line-strong)"
                strokeWidth={1.5}
              />
            );
          })}
          <circle cx={cx} cy={cy} r={30} fill="var(--primary)" />
          <text x={cx} y={cy + 4} textAnchor="middle" className="fill-white text-[11px] font-semibold">
            {center.label}
          </text>
          {positioned.map((n) => (
            <g
              key={n.id}
              className="cursor-pointer"
              onClick={() => onRecenter?.(n.id)}
              tabIndex={0}
              role="button"
              aria-label={`Navigate to ${n.label}`}
            >
              <circle cx={n.x} cy={n.y} r={24} fill="var(--surface)" stroke="var(--primary)" strokeWidth={1.5} />
              <text x={n.x} y={n.y + 4} textAnchor="middle" className="fill-current text-[10px] font-medium text-ink">
                {n.label.length > 10 ? n.label.slice(0, 9) + "…" : n.label}
              </text>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
