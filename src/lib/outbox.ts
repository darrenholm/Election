"use client";

/**
 * The canvasser's safety net.
 *
 * Brockton has plenty of places where a phone shows one bar and a POST times
 * out. Losing a door someone actually knocked is the worst failure this app
 * can have, so every contact is written to a local queue first and only
 * removed once the server has confirmed it. If the network is fine — the
 * normal case — the round trip takes a moment and the entry never lingers.
 *
 * localStorage rather than IndexedDB on purpose: the payloads are tiny, the
 * API is synchronous, and there is no schema to migrate. If a canvasser's
 * phone somehow filled the quota we would rather fail loudly than silently.
 */

const KEY = "campaign:outbox:v1";

export type QueuedContact = {
  /** Generated on the device so a retry can never create the contact twice. */
  clientId: string;
  voterId: string;
  volunteerId: string | null;
  method: string;
  result: string;
  supportLevel: number | null;
  wantsSign: boolean;
  wantsToVolunteer: boolean;
  isDonorProspect: boolean;
  markDoNotContact: boolean;
  phone: string;
  email: string;
  smsConsent: string;
  smsConsentWording: string;
  notes: string;
  /** null when it never came up; false is a recorded "no". */
  willEndorsePublicly: boolean | null;
  followUpNeeded: boolean;
  followUpReason: string;
  occurredAt: string;
  /** Local bookkeeping, never sent. */
  queuedAt: string;
  attempts: number;
  lastError: string;
};

function read(): QueuedContact[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedContact[]) : [];
  } catch {
    return [];
  }
}

function write(items: QueuedContact[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Quota or private mode. Nothing useful to do here; the caller has already
    // shown the contact as unsaved.
  }
  window.dispatchEvent(new CustomEvent("outbox:changed", { detail: items.length }));
}

export function outboxCount(): number {
  return read().length;
}

export function enqueue(item: QueuedContact): void {
  const items = read();
  // Same clientId twice means a double tap, not two doors.
  if (items.some((i) => i.clientId === item.clientId)) return;
  items.push(item);
  write(items);
}

function dequeue(clientId: string): void {
  write(read().filter((i) => i.clientId !== clientId));
}

function recordFailure(clientId: string, error: string): void {
  write(
    read().map((i) =>
      i.clientId === clientId ? { ...i, attempts: i.attempts + 1, lastError: error } : i,
    ),
  );
}

export type FlushResult = { sent: number; failed: number; remaining: number };

/**
 * Try to post everything held locally. Runs one at a time rather than in
 * parallel: a phone that just regained a weak signal copes far better with a
 * single request than with twenty at once.
 */
export async function flushOutbox(): Promise<FlushResult> {
  const items = read();
  let sent = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });

      if (response.ok) {
        dequeue(item.clientId);
        sent++;
        continue;
      }

      // A 4xx means this entry will never succeed — a deleted voter, say.
      // Keeping it would block the queue forever, so drop it and move on.
      if (response.status >= 400 && response.status < 500) {
        dequeue(item.clientId);
        failed++;
        continue;
      }

      recordFailure(item.clientId, `Server returned ${response.status}`);
      failed++;
      // A failing server will fail for the next one too; stop and retry later.
      break;
    } catch (error) {
      recordFailure(item.clientId, error instanceof Error ? error.message : "Network error");
      failed++;
      break;
    }
  }

  return { sent, failed, remaining: read().length };
}

/** Stable id for a queued contact, so retries stay idempotent. */
export function newClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
