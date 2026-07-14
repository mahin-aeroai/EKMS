"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Sparkles, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

type ToastKind = "success" | "warning" | "danger" | "info" | "ai";

interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

const ICONS: Record<ToastKind, typeof Info> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
  ai: Sparkles,
};

const COLORS: Record<ToastKind, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  ai: "text-ai",
};

interface ToastContextValue {
  toast: (kind: ToastKind, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

/**
 * Notifications — Deliverable 3.6 / Interaction Standards Deliverable 8
 * Purpose: non-blocking toast for transient confirmations; a persistent
 * NotificationCenter entry (below) covers anything requiring later action.
 * AI-triggered toasts use the "ai" kind and the AI Accent color, distinct from system alerts.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((kind: ToastKind, message: string) => {
    const id = crypto.randomUUID();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <div
              key={t.id}
              role="status"
              className="flex items-center gap-2 rounded-lg border border-line bg-surface-overlay px-4 py-3 text-sm shadow-3"
            >
              <Icon size={16} className={COLORS[t.kind]} />
              <span className="text-ink">{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

export interface NotificationItem {
  id: string;
  kind: ToastKind;
  title: string;
  time: string;
  read?: boolean;
  actionRequired?: boolean;
}

/** Notification Center — the persistent list, opened from the Top Nav's bell icon. */
export function NotificationCenter({ items }: { items: NotificationItem[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((n) => {
        const Icon = ICONS[n.kind];
        return (
          <li key={n.id} className={cn("flex items-start gap-3 px-4 py-3", !n.read && "bg-primary-tint/40")}>
            <Icon size={16} className={cn("mt-0.5 shrink-0", COLORS[n.kind])} />
            <div className="flex-1">
              <p className="text-sm text-ink">{n.title}</p>
              <span className="text-xs text-ink-muted">{n.time}</span>
            </div>
            {n.actionRequired && (
              <span className="rounded-full bg-warning-tint px-2 py-0.5 text-[11px] font-medium text-warning">
                Action required
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
