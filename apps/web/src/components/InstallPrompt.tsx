"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

const DISMISSED_KEY = "mmdi-one-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Android/desktop-Chrome install banner. iOS has no `beforeinstallprompt`
 * event at all -- there, "Add to Home Screen" only ever lives in Safari's
 * own Share sheet, which no page content can trigger or replace, so this
 * component is a genuine no-op there (the event this listens for simply
 * never fires) rather than something that needs its own iOS branch.
 *
 * Dismissal is remembered in localStorage, not just component state -- a
 * "no thanks" that comes back on every reload would defeat the point of
 * being dismissible.
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  function dismiss() {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, "1");
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    // Whatever the person chose, the browser will never re-fire this exact
    // prompt event for the same deferred object -- treat the banner as done
    // either way rather than leaving a now-inert "Install" button up.
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  }

  if (!visible) return null;

  return (
    // Below sm this is full-bleed (inset-x-0 bottom-0) -- in standalone iOS
    // that means the home indicator (bottom) and, in landscape, the sensor-
    // housing inset (left or right depending on rotation) both cut directly
    // into it, so padding gets the safe-area env() added on those sides. At
    // sm+ it's a floating card instead (sm:bottom-.../sm:left-...), where the
    // POSITION already clears the inset, so padding there reverts to plain
    // values rather than double-counting the same inset as both an offset
    // and padding. env() is 0 outside standalone/notched devices either way.
    <div className="fixed inset-x-0 bottom-0 z-50 flex items-center gap-3 border-t border-line bg-surface-overlay pt-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] pl-[calc(1rem_+_env(safe-area-inset-left))] pr-[calc(1rem_+_env(safe-area-inset-right))] shadow-4 sm:inset-x-auto sm:bottom-[calc(1rem_+_env(safe-area-inset-bottom))] sm:left-[calc(1rem_+_env(safe-area-inset-left))] sm:max-w-sm sm:rounded-lg sm:border sm:pb-3 sm:pl-4 sm:pr-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
        <Download size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">Install MMDI ONE</p>
        <p className="text-xs text-ink-secondary">Add it to your home screen for quick, full-screen access.</p>
      </div>
      <button
        onClick={install}
        className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-on-brand hover:bg-primary-hover"
      >
        Install
      </button>
      <button
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-surface-sunken"
      >
        <X size={16} />
      </button>
    </div>
  );
}
