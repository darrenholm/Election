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
 *
 * The one exception is asked for by name. A canvasser heading into a township
 * with no coverage can save a turf to the phone (src/lib/offline-turf.ts); that
 * puts the walk-list page itself in this cache so it will open with no signal.
 * The list it renders comes from IndexedDB and states on screen exactly when it
 * was frozen — which is what makes it honest rather than stale.
 */

const OFFLINE_URL = "/offline.html";
const WALK_PATH = "/canvass/offline";
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

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Build assets are content-hashed, so a cached one can never be the wrong
  // version of itself. Serving them from the cache is what lets the saved walk
  // list actually start with no signal.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy).then(() => trim(cache)));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode !== "navigate") return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(CACHE);
      // The saved walk list, when it is what was asked for and it is there.
      if (url.pathname === WALK_PATH) {
        const saved = await cache.match(WALK_PATH);
        if (saved) return saved;
      }
      return (await cache.match(OFFLINE_URL)) ?? Response.error();
    }),
  );
});

/**
 * Keep the shell cache from growing for ever.
 *
 * Build assets are content-hashed, so every deploy leaves the last one's files
 * behind with nothing to replace them. Entries come back in the order they were
 * added, so the oldest go first — and the saved walk list re-caches what it
 * needs each time a turf is saved, which is the only moment any of this has to
 * be right.
 */
const MAX_ENTRIES = 300;

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  await Promise.all(
    keys.slice(0, keys.length - MAX_ENTRIES).map((key) => {
      const path = new URL(key.url).pathname;
      // Never evict the two pages that exist to work with no signal.
      if (path === OFFLINE_URL || path === WALK_PATH) return undefined;
      return cache.delete(key);
    }),
  );
}
