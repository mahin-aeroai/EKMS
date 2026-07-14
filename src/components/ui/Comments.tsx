"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "./Button";

export interface Comment {
  id: string;
  author: string;
  content: string;
  time: string;
  resolved?: boolean;
}

/**
 * Comments — Deliverable 3.5
 * Purpose: threaded discussion attached to any record.
 * Behaviour: reply-in-thread; @mention notifies the mentioned user.
 * Usage rule: available on every record type uniformly — a platform primitive, not a
 * per-module feature.
 * AI Integration: AI can summarize a long thread or suggest a reply.
 */
export function Comments({ comments, onAdd }: { comments: Comment[]; onAdd: (text: string) => void }) {
  const [draft, setDraft] = useState("");

  return (
    <div className="flex flex-col gap-4">
      {comments.length > 3 && (
        <button className="flex w-fit items-center gap-1.5 rounded-md bg-ai-tint px-3 py-1.5 text-xs font-medium text-ai">
          <Sparkles size={12} /> Summarize this thread
        </button>
      )}
      <ul className="flex flex-col gap-3">
        {comments.map((c) => (
          <li key={c.id} className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-tint text-xs font-semibold text-primary">
              {c.author.slice(0, 2).toUpperCase()}
            </span>
            <div className="flex-1 rounded-lg bg-surface-sunken px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-ink">{c.author}</span>
                <span className="text-xs text-ink-muted">{c.time}</span>
                {c.resolved && (
                  <span className="ml-auto rounded-full bg-success-tint px-2 py-0.5 text-[10px] font-medium text-success">
                    Resolved
                  </span>
                )}
              </div>
              <p className="text-sm text-ink-secondary">{c.content}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a comment… use @ to mention someone"
          className="flex-1 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <Button
          size="sm"
          onClick={() => {
            if (draft.trim()) {
              onAdd(draft.trim());
              setDraft("");
            }
          }}
        >
          Post
        </Button>
      </div>
    </div>
  );
}
