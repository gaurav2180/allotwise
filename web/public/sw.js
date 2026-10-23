// Allotwise service worker: lets the installed app open, and show the last
// IPO data it saw, without a connection.
//
// What it stores, and what it never does:
// - Pages and market data (IPO list, an IPO's details, its GMP history):
//   network first, so online you always get the latest; the last good answer
//   is kept for when you are offline.
// - The app's code, fonts and icons: saved copy first. Their file names change
//   with every release, so a saved copy is never stale.
// - Never anything carrying a PAN. Allotment checks are POST requests, which
//   this worker does not handle at all, and their route is excluded anyway.
//
// Bump VERSION to drop every saved copy on the next visit.

const VERSION = "v1";
const PAGES = `aw-pages-${VERSION}`;
const DATA = `aw-data-${VERSION}`;
const STATIC = `aw-static-${VERSION}`;
const OFFLINE_URL = "/offline";

// Pages kept for offline use, by path (an IPO's GMP page is one page for every
// IPO: it reads which one from the address in the browser).
const PAGE_PATHS = new Set(["/", "/app", "/pans", "/gmp", "/disclaimer", "/privacy", "/terms", OFFLINE_URL]);
// Market data kept for offline use.
const DATA_PATTERNS = [/^\/api\/ipos$/, /^\/api\/ipo\/[^/]+$/, /^\/api\/gmp\/[^/]+$/];
// Never stored, whatever the method.
const NEVER = [/^\/api\/allotment/, /^\/api\/status/, /^\/api\/waitlist/, /^\/api\/contact/];
const isStatic = (path) => path.startsWith("/_next/static/") || /^\/(icon-|apple-icon|icon\.svg)/.test(path);

const LIMITS = { [DATA]: 60, [STATIC]: 400 };
// After this long, a saved copy stands in for a slow network -- but only if
// there is one; with nothing saved, the network is waited for.
const NETWORK_TIMEOUT_MS = 6000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((c) => c.addAll([OFFLINE_URL, "/icon-192", "/icon-512"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("aw-") && !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The page that registered this worker loaded before it existed, so none of
// it went through here. It sends its own address and the code files it
// loaded, so the very first visit already works offline afterwards.
self.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || msg.type !== "warm") return;
  event.waitUntil(
    (async () => {
      if (typeof msg.page === "string" && PAGE_PATHS.has(msg.page)) {
        const res = await fetch(msg.page).catch(() => null);
        if (res && res.ok) await (await caches.open(PAGES)).put(msg.page, res);
      }
      const statics = (Array.isArray(msg.urls) ? msg.urls : [])
        .map((u) => {
          try {
            return new URL(u, self.location.origin);
          } catch {
            return null;
          }
        })
        .filter((u) => u && u.origin === self.location.origin && isStatic(u.pathname));
      const cache = await caches.open(STATIC);
      for (const u of statics) {
        if (await cache.match(u.href)) continue;
        const res = await fetch(u.href).catch(() => null);
        if (res && res.ok) await cache.put(u.href, res);
      }
      await trim(STATIC);
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER.some((re) => re.test(url.pathname))) return;

  if (request.mode === "navigate") {
    event.respondWith(page(event, request, url));
  } else if (isStatic(url.pathname)) {
    event.respondWith(savedFirst(request));
  } else if (DATA_PATTERNS.some((re) => re.test(url.pathname))) {
    event.respondWith(networkFirst(event, request, DATA, url.pathname + url.search));
  }
});

/**
 * The network's answer, or after NETWORK_TIMEOUT_MS the saved copy if there
 * is one. A good network answer is saved (even when it arrives after the
 * saved copy was already shown, so the next visit is current).
 */
async function networkOrSaved(event, request, cacheName, key) {
  const network = fetch(request).then(async (res) => {
    if (res.ok && key) {
      const cache = await caches.open(cacheName);
      await cache.put(key, await stamped(res.clone()));
      await trim(cacheName);
    }
    return res;
  });
  event.waitUntil(network.catch(() => {}));
  const timedOut = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, "timeout"));
  const first = await Promise.race([network.then((res) => ({ res }), () => ({ failed: true })), timedOut]);
  if (first !== "timeout" && first.res) return first.res;
  const saved = key ? await caches.match(key, { cacheName }) : undefined;
  if (saved) return saved;
  // Timed out with nothing saved: keep waiting for the network after all.
  if (first === "timeout") return network;
  return null;
}

async function page(event, request, url) {
  const key = PAGE_PATHS.has(url.pathname) ? url.pathname : null;
  const res = await networkOrSaved(event, request, PAGES, key).catch(() => null);
  return res || (await caches.match(OFFLINE_URL, { cacheName: PAGES })) || Response.error();
}

async function networkFirst(event, request, cacheName, key) {
  const res = await networkOrSaved(event, request, cacheName, key).catch(() => null);
  return res || Response.error();
}

async function savedFirst(request) {
  const saved = await caches.match(request, { cacheName: STATIC });
  if (saved) return saved;
  const res = await fetch(request);
  if (res.ok) {
    await (await caches.open(STATIC)).put(request, res.clone());
    trim(STATIC);
  }
  return res;
}

/**
 * A copy to save, stamped with when it was saved. A fresh answer from the
 * network never carries the stamp, so the page can tell a saved copy apart
 * and say how old it is -- which the browser's own online flag cannot be
 * trusted to do (Wi-Fi with no internet still reads as online).
 */
async function stamped(res) {
  const headers = new Headers(res.headers);
  headers.set("x-aw-saved-at", String(Date.now()));
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers });
}

/** Oldest entries out once a cache passes its limit. */
async function trim(cacheName) {
  const limit = LIMITS[cacheName];
  if (!limit) return;
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(k);
}
