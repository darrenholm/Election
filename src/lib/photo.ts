"use client";

import { withStore } from "./idb";

/**
 * Selfies taken at a door, on the way to the database.
 *
 * Two problems to solve. A modern phone camera produces a 4–12 MB JPEG, which
 * is far more than anyone needs of a canvasser and a supporter on a porch and
 * far too much to push over one bar of rural signal — so the image is redrawn
 * to a sane size before it leaves the phone. And the signal may not be there at
 * all, so a photo that cannot be sent has to survive being put in a pocket and
 * driven home.
 *
 * IndexedDB rather than the localStorage used for contacts: a contact is a few
 * hundred bytes of JSON, a photo is a couple of hundred kilobytes of binary,
 * and localStorage would blow its quota after a handful and take the queued
 * doors down with it.
 */

/** Longest edge, in pixels, after downscaling. */
const MAX_EDGE = 1280;
/** JPEG quality. 0.82 is the point where porch photographs stop improving. */
const QUALITY = 0.82;

export type PreparedPhoto = {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
};

/**
 * Draw any image source down to a sendable JPEG.
 *
 * Shared by both ways a photo gets taken — the OS camera handing back a file,
 * and the in-app camera handing over a live video frame — so the two produce
 * byte-for-byte comparable output and nothing downstream has to care which was
 * used.
 */
function redraw(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): Promise<PreparedPhoto> {
  const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot resize the photo.");
  ctx.drawImage(source, 0, 0, width, height);

  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  ).then((blob) => {
    if (!blob) throw new Error("Could not read the photo.");
    return { blob, dataUrl: canvas.toDataURL("image/jpeg", 0.5), width, height };
  });
}

/** Redraw a camera image down to something sendable. */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(file);
  try {
    return await redraw(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

/**
 * Freeze the current frame of a live camera preview.
 *
 * The intrinsic video dimensions are used rather than the element's rendered
 * size: the preview is letterboxed to fit whatever space the layout gave it,
 * and capturing at display size would throw away most of the sensor.
 */
export async function captureFromVideo(video: HTMLVideoElement): Promise<PreparedPhoto> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) throw new Error("The camera is not ready yet.");
  return redraw(video, width, height);
}

/* ------------------------------------------------------------- the queue --- */

const DB_NAME = "campaign-photos";
const STORE = "pending";

export type QueuedPhoto = {
  clientId: string;
  voterId: string | null;
  blob: Blob;
  width: number;
  height: number;
  mayPublish: boolean;
  permissionWording: string;
  caption: string;
  queuedAt: string;
  attempts: number;
};

export async function queuePhoto(photo: QueuedPhoto): Promise<void> {
  await withStore<IDBValidKey>(DB_NAME, STORE, "readwrite", (s) => s.put(photo, photo.clientId));
  announce();
}

export async function pendingPhotos(): Promise<QueuedPhoto[]> {
  try {
    return await withStore<QueuedPhoto[]>(DB_NAME, STORE, "readonly", (s) => s.getAll() as IDBRequest<QueuedPhoto[]>);
  } catch {
    return [];
  }
}

async function forget(clientId: string): Promise<void> {
  await withStore<undefined>(DB_NAME, STORE, "readwrite", (s) => s.delete(clientId));
  announce();
}

async function announce(): Promise<void> {
  const items = await pendingPhotos();
  window.dispatchEvent(new CustomEvent("photos:changed", { detail: items.length }));
}

/**
 * Send whatever is waiting. Safe to call often — uploads are idempotent on
 * clientId, so a photo that arrived but whose response was lost is recognised
 * rather than stored twice.
 */
export async function flushPhotos(): Promise<{ sent: number; held: number }> {
  const items = await pendingPhotos();
  let sent = 0;

  for (const item of items) {
    const body = new FormData();
    body.set("clientId", item.clientId);
    if (item.voterId) body.set("voterId", item.voterId);
    body.set("width", String(item.width));
    body.set("height", String(item.height));
    body.set("mayPublish", item.mayPublish ? "1" : "");
    body.set("permissionWording", item.permissionWording);
    body.set("caption", item.caption);
    body.set("photo", item.blob, `${item.clientId}.jpg`);

    try {
      const response = await fetch("/api/photos", { method: "POST", body });
      if (response.ok || response.status === 409) {
        await forget(item.clientId);
        sent++;
        continue;
      }
      // A rejected photo is never going to be accepted on a retry, so drop it
      // rather than leaving it to fail forever in the background.
      if (response.status === 400 || response.status === 413) {
        await forget(item.clientId);
        continue;
      }
    } catch {
      // Still no network. Leave it where it is.
    }
  }

  const held = (await pendingPhotos()).length;
  return { sent, held };
}
