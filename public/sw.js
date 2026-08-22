/*
 * A deliberately minimal service worker.
 *
 * Its job is to make the app installable to a phone's home screen, not to make
 * it work offline. Walk lists are live data and a cached one is worse than no
 * list at all — a canvasser knocking doors from yesterday's support levels does
 * real damage. What survives a dead zone instead is the *outbox*: contacts
 * logged with no signal are held in the browser and posted when it returns.
 * See src/lib/outbox.ts.
 *
 * So: navigations always go to the network, and a friendly page is shown when
 * that fails. Nothing is served stale.
 */

const OFFLINE_URL = "/offline.html";
const CACHE = "campaign-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_URL])).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.mode !== "navigate") return;

  event.respondWith(
    fetch(request).catch(() => caches.match(OFFLINE_URL).then((r) => r ?? Response.error())),
  );
});
