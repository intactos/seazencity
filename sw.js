// Минимальный SW: кэширует только локальные файлы PWA.
// ВАЖНО: он НЕ "проксирует" WLED. Он только про кэш UI.

const CACHE = "seazencity-pwa-test-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./cache-test.txt",
  "./sw.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE ? caches.delete(k) : Promise.resolve())));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Кэшируем только свои файлы (тот же origin). Это важно.
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request);
    if (cached) return cached;

    const res = await fetch(event.request);
    // Кладём в кэш только успешные ответы.
    if (res && res.ok) cache.put(event.request, res.clone());
    return res;
  })());
});