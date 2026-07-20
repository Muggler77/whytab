const CACHE_NAME = "whytab-shell-v0.2.3";
const ICON_CACHE_NAME = "whytab-icons-v1";
const APP_SHELL = ["./", "./app.webmanifest?v=0.2.3", "./icons/icon128.png?v=0.2.3", "./wallpapers/photo/mobile/aurora-lake.webp"];
const ICON_HOSTS = new Set(["cdn.simpleicons.org", "icons.duckduckgo.com", "www.google.com"]);
const PRESERVED_CACHES = new Set([CACHE_NAME, ICON_CACHE_NAME]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !PRESERVED_CACHES.has(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

const cacheExternalIcon = async (request) => {
  const cache = await caches.open(ICON_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    void cache.put(request, response.clone());
  }
  return response;
};

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    if (request.destination === "image" && ICON_HOSTS.has(url.hostname)) {
      event.respondWith(cacheExternalIcon(request));
    }
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put("./", copy));
          return response;
        })
        .catch(() => caches.match("./"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && ["script", "style", "image", "font"].includes(request.destination)) {
        const copy = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    }))
  );
});
