// MMDI ONE — app-shell service worker.
//
// Scope, deliberately narrow: this app is a live Supabase-backed internal
// platform, not a content site. Caching business data here would mean
// showing someone stale customer/job-order/inventory numbers with no way to
// tell they're stale -- worse than just failing offline. So this SW only
// ever caches the "shell": the offline fallback page, the manifest, icons,
// and Next's own hashed static assets (immutable per build, safe to
// cache-first). Every other request -- every navigation, every /api/* call,
// every Supabase REST/auth call -- passes straight through to the network
// untouched. The only thing offline support buys here is "the app doesn't
// show a browser error page when there's no connection" -- not "the app
// works offline."

const CACHE_VERSION = "mmdi-one-shell-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [OFFLINE_URL, "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isNextStaticAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Cross-origin (Supabase, the AI API, Google, etc.) and same-origin API
  // routes are never touched -- straight to the network, no cache involved
  // at all. This isn't just "don't cache it," it's "don't even let the SW's
  // fetch handler intercept it," so a network error there surfaces exactly
  // as it would with no service worker installed.
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (isNextStaticAsset(url)) {
    // Cache-first: the build hash in the filename means a given URL's
    // content never changes, so there's no staleness risk in serving a
    // cached copy without revalidating.
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        return res;
      }))
    );
    return;
  }

  if (request.mode === "navigate") {
    // Network-first for every page navigation -- this app's pages are
    // server-rendered against live data, so a cached page is only ever a
    // last resort, not a first choice. Falls back to the offline page only
    // when the network is genuinely unreachable.
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((res) => res ?? Response.error()))
    );
  }
  // Everything else same-origin (a normal asset, a font, etc.) just falls
  // through to the browser's default network handling -- no event.respondWith call.
});
