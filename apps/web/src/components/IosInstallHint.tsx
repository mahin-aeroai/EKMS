"use client";

import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";

const DISMISSED_KEY = "mmdi-one-ios-install-hint-dismissed";

// iPadOS 13+ reports its platform as "MacIntel" (indistinguishable from a
// real Mac by UA alone) -- the touch-points check is the standard way to
// tell an iPad apart from an actual Mac, neither of which has a touchscreen.
function isIos(): boolean {
  const ua = window.navigator.userAgent;
  const isIphoneOrIpod = /iPhone|iPod/.test(ua);
  const isIpad = /iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return isIphoneOrIpod || isIpad;
}

// Restricted to Safari specifically: every other iOS browser (Chrome/
// Firefox/Edge on iOS) is really just Safari's engine wearing a different
// UI, and none of them expose a Share-sheet "Add to Home Screen" action the
// way Safari itself does -- pointing someone at Share in Chrome would just
// be wrong.
function isIosSafari(): boolean {
  const ua = window.navigator.userAgent;
  return isIos() && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * iOS has no `beforeinstallprompt` event (see InstallPrompt.tsx) -- Safari's
 * Share sheet is the only path to "Add to Home Screen" there, and no page
 * content can open that sheet or replace it. All this can do is tell the
 * person where to find it, once, on iOS Safari specifically, and only if
 * the app isn't already running standalone (installed).
 */
export function IosInstallHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;
    if (isStandalone()) return;
    // Synchronizing with real browser/platform APIs (localStorage, UA,
    // matchMedia) that can't be read at render time on the server -- not a
    // value derivable from props/state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isIosSafari()) setVisible(true);
  }, []);

  function dismiss() {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, "1");
  }

  if (!visible) return null;

  return (
    // Same reasoning as InstallPrompt.tsx's identical markup: full-bleed
    // below sm needs the safe-area env() added to its edge-touching padding
    // (this is standalone iOS specifically, so it's the one of the two
    // banners that will actually render there in practice); the sm+
    // floating-card state clears the inset via its own offset instead, so
    // padding there reverts to plain values.
    <div className="fixed inset-x-0 bottom-0 z-50 flex items-center gap-3 border-t border-line bg-surface-overlay pt-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] pl-[calc(1rem_+_env(safe-area-inset-left))] pr-[calc(1rem_+_env(safe-area-inset-right))] shadow-4 sm:inset-x-auto sm:bottom-[calc(1rem_+_env(safe-area-inset-bottom))] sm:left-[calc(1rem_+_env(safe-area-inset-left))] sm:max-w-sm sm:rounded-lg sm:border sm:pb-3 sm:pl-4 sm:pr-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
        <Share size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">Install MMDI ONE</p>
        <p className="text-xs text-ink-secondary">
          Tap <Share size={11} className="inline -translate-y-px" aria-hidden /> Share, then &ldquo;Add to Home Screen&rdquo;.
        </p>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss install hint"
        className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-surface-sunken"
      >
        <X size={16} />
      </button>
    </div>
  );
}
