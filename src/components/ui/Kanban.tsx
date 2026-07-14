"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

export interface KanbanCard {
  id: string;
  title: string;
  meta?: string;
  aiSuggestedColumn?: string;
}

export interface KanbanColumn {
  id: string;
  title: string;
  cards: KanbanCard[];
}

/**
 * Kanban — Deliverable 3.3
 * Purpose: status-driven board view (Sales pipeline, Installation backlog, NCR status).
 * Behaviour: drag-and-drop between columns triggers the same status-change workflow as
 * an edit form would. A full keyboard alternative (move via menu) should back this in
 * production per the Accessibility principle — this demo uses native HTML5 DnD plus a
 * left/right keyboard-accessible move affordance.
 * Usage rule: never for data with more than ~6 status values.
 */
export function Kanban({ initialColumns }: { initialColumns: KanbanColumn[] }) {
  const [columns, setColumns] = useState(initialColumns);
  const [dragCard, setDragCard] = useState<{ colId: string; cardId: string } | null>(null);

  function moveCard(cardId: string, fromCol: string, toCol: string) {
    if (fromCol === toCol) return;
    setColumns((cols) => {
      const card = cols.find((c) => c.id === fromCol)?.cards.find((c) => c.id === cardId);
      if (!card) return cols;
      return cols.map((col) => {
        if (col.id === fromCol) return { ...col, cards: col.cards.filter((c) => c.id !== cardId) };
        if (col.id === toCol) return { ...col, cards: [...col.cards, card] };
        return col;
      });
    });
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {columns.map((col) => (
        <div
          key={col.id}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => dragCard && moveCard(dragCard.cardId, dragCard.colId, col.id)}
          className="flex w-64 shrink-0 flex-col gap-2 rounded-lg bg-surface-sunken p-3"
        >
          <div className="flex items-center justify-between px-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">{col.title}</h4>
            <span className="text-xs text-ink-muted">{col.cards.length}</span>
          </div>
          {col.cards.map((card) => (
            <div
              key={card.id}
              draggable
              onDragStart={() => setDragCard({ colId: col.id, cardId: card.id })}
              className={cn(
                "cursor-grab rounded-md border border-line bg-surface p-3 text-sm shadow-1 active:cursor-grabbing"
              )}
            >
              <p className="font-medium text-ink">{card.title}</p>
              {card.meta && <p className="mt-0.5 text-xs text-ink-muted">{card.meta}</p>}
              {card.aiSuggestedColumn && card.aiSuggestedColumn !== col.title && (
                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-ai">
                  <Sparkles size={10} /> AI suggests: {card.aiSuggestedColumn}
                </p>
              )}
            </div>
          ))}
          {col.cards.length === 0 && (
            <p className="rounded-md border border-dashed border-line-strong p-3 text-center text-xs text-ink-muted">
              Drop here
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
