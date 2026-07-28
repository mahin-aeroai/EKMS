"use client";

import { useEffect } from "react";

/**
 * Registers the app-shell service worker (public/sw.js). A tiny client
 * component rather than inline script in layout.tsx so it can use useEffect
 * -- registration must happen after mount, never during server render or
 * the build step, and must never throw the app itself if it fails (older
 * browsers, or serviceWorker being unavailable over plain http in local
 * dev on some hosts).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Silent -- a failed SW registration should never block or error the
      // app itself, it just means no offline app-shell / install prompt.
    });
  }, []);

  return null;
}
