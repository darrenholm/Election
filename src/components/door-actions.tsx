"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enqueue, flushOutbox, newClientId, type QueuedContact } from "@/lib/outbox";

/**
 * One tap for the commonest outcome at a door: nobody answered.
 *
 * Worth its own button rather than a trip through the contact form. Most doors
 * on most nights are nobody home, and a canvasser standing in the rain should
 * not have to open a form, pick a result and save to record that. It also has
 * to be recorded against the *door* — logging "not home" against one named
 * resident says something the canvasser does not know, which is that the
 * others were in.
 *
 * Queues through the same outbox as everything else, so it is as safe in a
 * dead zone as a full contact.
 */
export function NobodyHome({
  householdId,
  defaultVolunteerId,
}: {
  householdId: string;
  defaultVolunteerId?: string | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "queued">("idle");

  async function record() {
    setState("saving");

    const item: QueuedContact = {
      clientId: newClientId(),
      voterId: null,
      householdId,
      newPerson: null,
      volunteerId: defaultVolunteerId ?? null,
      method: "DOOR",
      result: "NOT_HOME",
      supportLevel: null,
      wantsSign: false,
      wantsToVolunteer: false,
      isDonorProspect: false,
      markDoNotContact: false,
      phone: "",
      email: "",
      smsConsent: "UNKNOWN",
      smsConsentWording: "",
      notes: "",
      willEndorsePublicly: null,
      followUpNeeded: false,
      followUpReason: "",
      occurredAt: new Date().toISOString(),
      queuedAt: new Date().toISOString(),
      attempts: 0,
      lastError: "",
    };

    enqueue(item);
    try {
      const result = await flushOutbox();
      if (result.remaining === 0) {
        setState("saved");
        router.refresh();
      } else {
        setState("queued");
      }
    } catch {
      setState("queued");
    }
  }

  if (state === "saved" || state === "queued") {
    return (
      <span className="text-xs text-muted">
        {state === "saved" ? "Nobody home — recorded." : "Nobody home — held on this phone."}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={record}
      disabled={state === "saving"}
      className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted hover:bg-raise disabled:opacity-50"
    >
      {state === "saving" ? "Saving…" : "Nobody home"}
    </button>
  );
}
