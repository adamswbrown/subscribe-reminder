const CACHE = "subremind-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icon-192.png"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// Network-first for navigations; offline fallback page when unreachable.
// Static assets are content-hashed and served with long HTTP cache headers,
// so the SW deliberately stays out of their way (no stale-bundle risk).
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(OFFLINE_URL).then((r) => r || Response.error())
      )
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "subscribe-reminder" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "subscribe-reminder", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url =
    (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(clients.openWindow(url));
});
