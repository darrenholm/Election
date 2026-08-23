"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enqueue, flushOutbox, newClientId, type QueuedContact } from "@/lib/outbox";

/**
 * One tap for the outcomes that need no conversation: nobody answered, and a
 * door hanger left behind.
 *
 * Worth their own buttons rather than a trip through the contact form. Most
 * doors on most nights are one of these two, and a canvasser standing in the
 * rain should not have to open a form, pick a result and save to record it.
 * Both are recorded against the *door* — saying "not home" about one named
 * resident claims something the canvasser does not know, which is that the
 * others were in, and a hanger is left at an address rather than given to a
 * person.
 *
 * Queues through the same outbox as everything else, so it is as safe in a
 * dead zone as a full contact.
 */
export function DoorTap({
  householdId,
  defaultVolunteerId,
  result,
  label,
  done,
}: {
  householdId: string;
  defaultVolunteerId?: string | null;
  /** A CONTACT_RESULTS key. */
  result: string;
  label: string;
  /** Past tense, for the line that replaces the button once it is logged. */
  done: string;
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
      result,
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
        {state === "saved" ? `${done} — recorded.` : `${done} — held on this phone.`}
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
      {state === "saving" ? "Saving…" : label}
    </button>
  );
}

/** Nobody answered. */
export function NobodyHome(props: { householdId: string; defaultVolunteerId?: string | null }) {
  return <DoorTap {...props} result="NOT_HOME" label="Nobody home" done="Nobody home" />;
}

/** A hanger on the knob, which is a fact about the address and not about anyone. */
export function DoorHanger(props: { householdId: string; defaultVolunteerId?: string | null }) {
  return (
    <DoorTap {...props} result="DOOR_HANGER" label="Door hanger" done="Door hanger dropped" />
  );
}
