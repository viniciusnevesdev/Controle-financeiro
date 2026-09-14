const CACHE = "meu-dinheiro-oficial-1.1.8-env3";
const CACHE_PREFIX = "meu-dinheiro-oficial-";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./apple-touch-icon.png", "./assets/index-dL0TG_c-.js", "./assets/index-C_4OH_-4.css"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const acceptsHtml = request.headers.get("accept")?.includes("text/html");
  const scopePath = new URL(self.registration.scope).pathname;
  const isAppNavigation = url.pathname === scopePath || url.pathname === scopePath + "index.html";
  if (acceptsHtml && !isAppNavigation) return;
  if (acceptsHtml) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put("./index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match("./index.html")),
    );
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});
