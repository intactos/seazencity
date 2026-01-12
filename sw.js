const CACHE = "seazencity-cache-v3";
const CORE = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./cache-test.txt"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    for (const k of keys){
      if (k.startsWith("seazencity-") && k !== CACHE){
        await caches.delete(k);
      }
    }
    await self.clients.claim();
  })());
});

function isAsset(u){ return /\.(png|jpg|jpeg|webp|svg|ico|txt)$/i.test(u.pathname); }

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);

    if (isAsset(url)){
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      const fresh = await fetch(req);
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    }

    try{
      const fresh = await fetch(req);
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch {
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      return new Response("Offline and not cached.", { status: 503, headers: { "Content-Type": "text/plain" }});
    }
  })());
});
