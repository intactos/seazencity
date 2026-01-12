const CACHE_NAME = "seazencity-pwa-cache-v1";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./sw.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(CORE_ASSETS);
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => (k === CACHE_NAME ? Promise.resolve() : caches.delete(k)))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isCoreAsset(url) {
  // Cache only same-origin core assets
  const p = url.pathname;
  return (
    p.endsWith("/") ||
    p.endsWith("/index.html") ||
    p.endsWith("/app.js") ||
    p.endsWith("/sw.js") ||
    p.endsWith("/manifest.webmanifest") ||
    p.endsWith("/icon-192.png") ||
    p.endsWith("/icon-512.png")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Only handle same-origin navigation + core assets
  if (url.origin !== self.location.origin) return;
  if (!isCoreAsset(url)) return;

  const forceOffline = url.searchParams.has("__offline");

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Remove our internal test flag for cache key lookup
      if (forceOffline) url.searchParams.delete("__offline");
      const cleanReq = new Request(url.toString(), { method: "GET" });

      const cached = await cache.match(cleanReq);
      if (forceOffline && cached) return cached;

      // Network-first, fallback to cache
      try {
        const res = await fetch(cleanReq);
        if (res && res.ok) cache.put(cleanReq, res.clone());
        return res;
      } catch {
        if (cached) return cached;
        // Last resort: if no cache, fail as-is
        return new Response("Offline and not cached", { status: 503 });
      }
    })()
  );
});