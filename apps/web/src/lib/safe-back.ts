"use client";

/**
 * A "Back" button's onClick, robust against the "stuck, nowhere to go"
 * case: a bookmarked/shared link, a page refresh, or a fresh tab all
 * leave this tab's in-app history empty, so a bare router.back() calls
 * do nothing and the page LOOKS stuck even though a Back button sits
 * right there. This prefers router.back() when there IS real history to
 * return to (it preserves whatever state the page you came from had --
 * a card grid's filters/scroll position, a list's search), and falls
 * back to pushing a specific, known-good destination otherwise, so
 * "Back" always does SOMETHING. Every history-based Back button across
 * /lfg/* should go through this rather than a bare router.back().
 *
 * Takes the router's own back()/push() rather than the full
 * next/navigation useRouter() type so this stays usable from any
 * component without importing Next's router type -- callers just pass
 * `router` from their own useRouter() call.
 */
export function safeBack(router: { back: () => void; push: (href: string) => void }, fallbackHref: string) {
  return () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  };
}
