"use client";

import { useEffect } from "react";

/**
 * Registers the app-shell service worker (public/sw.js). A tiny client
 * component rather than inline script in layout.tsx so it can use useEffect
 * -- registration must happen after mount, never during server render or
 * the build step, and must never throw the app itself if it fails (older
 * browsers, or serviceWorker being unavailable over plain http in local
 * dev on some hosts).
 *
 * `unregisterOnly` is for portal.mmdi.in: this SW was never meant to run
 * there (see layout.tsx's comment on why the install prompts are gated the
 * same way), but a customer who visited before that gating existed may
 * already have it registered and controlling the page. Passing true here
 * cleans that up -- unregisters instead of registering -- rather than just
 * stopping new registrations and leaving already-installed ones stuck
 * indefinitely.
 */
export function ServiceWorkerRegister({ unregisterOnly = false }: { unregisterOnly?: boolean }) {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (unregisterOnly) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {
          // Silent, same reasoning as below -- cleanup best-effort only.
        });
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Silent -- a failed SW registration should never block or error the
      // app itself, it just means no offline app-shell / install prompt.
    });
  }, [unregisterOnly]);

  return null;
}
