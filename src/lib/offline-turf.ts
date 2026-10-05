"use client";

import { withStore } from "./idb";
import { outboxItems } from "./outbox";
import { SNAPSHOT_VERSION, type TurfSnapshot } from "./turf-snapshot";

/**
 * Turfs saved to this phone on purpose, before heading somewhere with no bars.
 *
 * IndexedDB rather than localStorage: a rural turf is a few hundred doors and
 * comfortably past what a five-megabyte string store should be asked to hold,
 * and the outbox lives in localStorage — filling that quota with a walk list
 * would take queued doors down with it, which is the one thing this app must
 * never do.
 */
const DB_NAME = "campaign-offline";
const STORE = "turfs";

/** The route that renders a saved turf, and the shell the phone must keep. */
export const WALK_PATH = "/canvass/offline";
const SHELL_CACHE = "campaign-shell-v1";

export async function saveSnapshot(snapshot: TurfSnapshot): Promise<void> {
  await withStore<IDBValidKey>(DB_NAME, STORE, "readwrite", (s) =>
    s.put(snapshot, snapshot.turfId),
  );
  await refreshIndex();
  announce();
}

export async function loadSnapshot(turfId: string): Promise<TurfSnapshot | null> {
  try {
    const found = await withStore<TurfSnapshot | undefined>(DB_NAME, STORE, "readonly", (s) =>
      s.get(turfId),
    );
    return found && found.version === SNAPSHOT_VERSION ? found : null;
  } catch {
    return null;
  }
}

export async function listSnapshots(): Promise<TurfSnapshot[]> {
  try {
    const all = await withStore<TurfSnapshot[]>(
      DB_NAME,
      STORE,
      "readonly",
      (s) => s.getAll() as IDBRequest<TurfSnapshot[]>,
    );
    return all
      .filter((s) => s.version === SNAPSHOT_VERSION)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function removeSnapshot(turfId: string): Promise<void> {
  try {
    await withStore<undefined>(DB_NAME, STORE, "readwrite", (s) => s.delete(turfId));
  } catch {
    // Nothing useful to do; a snapshot that will not delete is harmless.
  }
  clearWalked(turfId);
  await refreshIndex();
  announce();
}

/**
 * A tiny list of what is saved, mirrored into localStorage.
 *
 * The offline notice page is plain HTML with no bundle behind it, and it needs
 * to know whether to offer the saved walk list. It cannot open IndexedDB to
 * find out — opening a database that does not exist yet *creates* it, empty,
 * and the app would then never get the chance to make its own object store.
 */
const INDEX_KEY = "campaign:offline-turfs:v1";

async function refreshIndex(): Promise<void> {
  try {
    const all = await listSnapshots();
    window.localStorage.setItem(
      INDEX_KEY,
      JSON.stringify(
        all.map((s) => ({ turfId: s.turfId, name: s.name, capturedAt: s.capturedAt })),
      ),
    );
  } catch {
    // The index is a convenience; the turfs themselves are already safe.
  }
}

/** Pages showing what is saved refresh on this, the way the outbox does. */
function announce(): void {
  window.dispatchEvent(new CustomEvent("offline-turfs:changed"));
}

/**
 * Fetch a turf and keep it, along with the page that can display it.
 *
 * Both halves matter. Without the snapshot there is nothing to read; without
 * the shell, opening the app in a dead zone gets the offline notice and the
 * saved turf may as well not be there.
 */
export async function downloadTurf(turfId: string): Promise<TurfSnapshot> {
  const response = await fetch(`/api/turfs/${turfId}/snapshot`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? "That turf is no longer yours to download."
        : `The server said ${response.status}.`,
    );
  }

  const snapshot = (await response.json()) as TurfSnapshot;
  await saveSnapshot(snapshot);
  await cacheWalkShell();
  return snapshot;
}

/**
 * Keep the walk-list page itself on the phone.
 *
 * The page is fetched and stored, then the build assets it names are stored
 * too — they are content-hashed, so a cached one is never the wrong version.
 * Failure here is not fatal and not worth an error: the snapshot is saved
 * either way, and a phone that still has signal will simply load the page.
 */
export async function cacheWalkShell(): Promise<void> {
  if (!("caches" in window)) return;

  try {
    const cache = await caches.open(SHELL_CACHE);
    const response = await fetch(WALK_PATH, { cache: "no-store" });
    if (!response.ok) return;

    const html = await response.clone().text();
    await cache.put(WALK_PATH, response);

    const assets = new Set(html.match(/\/_next\/static\/[^"'\)\s]+/g) ?? []);
    await Promise.all(
      Array.from(assets).map((url) => cache.add(url).catch(() => undefined)),
    );

    await warmWalkPage();
  } catch {
    // Offline already, or storage refused. The snapshot is still saved.
  }
}

/**
 * Render the walk page once, out of sight, while the signal is still good.
 *
 * The HTML names the bundles it starts with, but a page also asks for pieces of
 * itself as it runs, and those are only ever requested by a browser actually
 * running it. Loading it in a hidden frame makes those requests happen here,
 * where the service worker can keep the answers — so the first time it is
 * opened for real, in a dead zone, nothing is missing.
 */
function warmWalkPage(): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;border:0;left:-9999px";

    const done = () => {
      frame.remove();
      resolve();
    };
    // Give up rather than hang: this is an optimisation, not the save itself.
    const timer = window.setTimeout(done, 8000);
    frame.onload = () => {
      window.clearTimeout(timer);
      // A moment for the page to ask for whatever it loads on its own.
      window.setTimeout(done, 1500);
    };
    frame.onerror = () => {
      window.clearTimeout(timer);
      done();
    };

    frame.src = WALK_PATH;
    document.body.appendChild(frame);
  });
}

/* --------------------------------------------------------- walked doors */

/**
 * Which doors have been logged since the snapshot was taken.
 *
 * Read out of the outbox rather than recorded by the forms: every door in this
 * app goes through that queue, so watching it catches a contact, a "nobody
 * home" and a door hanger alike without any of them having to know a walk list
 * is watching. Entries vanish from the queue once they upload, so they are
 * copied here as they appear and never removed — this is a record of what this
 * canvasser has done today, not of what is still waiting to send.
 */
const WALKED_KEY = "campaign:walked:v1";

type WalkedMap = Record<string, string[]>;

function readWalked(): WalkedMap {
  try {
    const raw = window.localStorage.getItem(WALKED_KEY);
    return raw ? (JSON.parse(raw) as WalkedMap) : {};
  } catch {
    return {};
  }
}

export function walkedDoors(turfId: string): string[] {
  if (typeof window === "undefined") return [];
  return readWalked()[turfId] ?? [];
}

/**
 * Fold anything now in the outbox that belongs to this turf into its walked
 * list, and answer with the whole list. Safe to call as often as the queue
 * changes; the same door twice is still one door.
 */
export function syncWalked(snapshot: TurfSnapshot): string[] {
  if (typeof window === "undefined") return [];

  const doorIds = new Set(snapshot.doors.map((d) => d.id));
  const voterDoor = new Map<string, string>();
  for (const door of snapshot.doors) {
    for (const voter of door.voters) voterDoor.set(voter.id, door.id);
  }

  const walked = new Set(walkedDoors(snapshot.turfId));
  const before = walked.size;

  for (const item of outboxItems()) {
    const doorId =
      item.householdId && doorIds.has(item.householdId)
        ? item.householdId
        : item.voterId
          ? voterDoor.get(item.voterId)
          : undefined;
    if (doorId) walked.add(doorId);
  }

  if (walked.size !== before) {
    const all = readWalked();
    all[snapshot.turfId] = Array.from(walked);
    try {
      window.localStorage.setItem(WALKED_KEY, JSON.stringify(all));
    } catch {
      // Full or private mode. The list still shows the right thing this session.
    }
  }

  return Array.from(walked);
}

function clearWalked(turfId: string): void {
  try {
    const all = readWalked();
    delete all[turfId];
    window.localStorage.setItem(WALKED_KEY, JSON.stringify(all));
  } catch {
    // See above.
  }
}
