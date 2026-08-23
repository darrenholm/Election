"use client";

import { withStore } from "./idb";

/**
 * A half-filled door, kept on the phone.
 *
 * A canvasser types a name and a mobile number, then the phone locks, or they
 * hit back, or they tap a street to check something. None of that should cost
 * them the conversation they just had. So every keystroke is written to the
 * device, and reappears when they come back to that door.
 *
 * This is not the outbox. The outbox holds doors that are *finished* and
 * waiting for signal; this holds doors that are not finished yet. A draft never
 * reaches the server, and is thrown away the moment the door is saved.
 *
 * Field values are small and go in localStorage, which is synchronous and
 * cannot fail halfway. A photo is megabytes of binary and goes in IndexedDB,
 * where it cannot crowd out the queue of doors waiting to upload.
 */

const PREFIX = "campaign:draft:v1:";
const PHOTO_DB = "campaign-drafts";
const PHOTO_STORE = "photos";

export type DraftPhoto = { blob: Blob; dataUrl: string; width: number; height: number };

export type Draft = {
  /** Every named field in the form, by name. */
  fields: Record<string, string | boolean>;
  consent: string;
  endorse: string;
  followUp: boolean;
  photoMayPublish: boolean;
  savedAt: string;
};

/**
 * Drafts are per door and per campaign. Two candidates in the same town knock
 * the same doors, and one's half-written note must never surface in the
 * other's form.
 */
export function draftKey(scope: string, voterId?: string | null, householdId?: string | null): string {
  return `${PREFIX}${scope || "none"}:${voterId ?? "-"}:${householdId ?? "-"}`;
}

export function readDraft(key: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    return draft && typeof draft === "object" && draft.fields ? draft : null;
  } catch {
    return null;
  }
}

export function writeDraft(key: string, draft: Draft): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Quota or private browsing. The door is still on screen and still
    // savable; losing the draft is not worth interrupting anyone over.
  }
}

export function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing useful to do.
  }
  void clearDraftPhoto(key);
}

/** True when a draft holds anything a canvasser would mind losing. */
export function draftHasContent(draft: Draft): boolean {
  if (draft.consent !== "UNKNOWN" || draft.endorse !== "UNKNOWN" || draft.followUp) return true;
  return Object.entries(draft.fields).some(([name, value]) => {
    if (typeof value === "boolean") return value;
    // A select left on its default is not something anyone typed.
    if (name === "result") return value !== "SPOKE";
    if (name === "method" || name === "volunteerId") return false;
    return value.trim() !== "";
  });
}

/* ------------------------------------------------------------ the photo --- */

export async function writeDraftPhoto(key: string, photo: DraftPhoto): Promise<void> {
  try {
    await withStore<IDBValidKey>(PHOTO_DB, PHOTO_STORE, "readwrite", (s) => s.put(photo, key));
  } catch {
    // See writeDraft: a lost draft photo must not break the door.
  }
}

export async function readDraftPhoto(key: string): Promise<DraftPhoto | null> {
  try {
    const found = await withStore<DraftPhoto | undefined>(
      PHOTO_DB,
      PHOTO_STORE,
      "readonly",
      (s) => s.get(key) as IDBRequest<DraftPhoto | undefined>,
    );
    return found ?? null;
  } catch {
    return null;
  }
}

export async function clearDraftPhoto(key: string): Promise<void> {
  try {
    await withStore<undefined>(PHOTO_DB, PHOTO_STORE, "readwrite", (s) => s.delete(key));
  } catch {
    // Nothing useful to do.
  }
}
